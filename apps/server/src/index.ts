import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";

const defaultEndpoint =
  process.env.ASR_WEBSOCKET_URL ??
  "wss://llm-v5rvizd868hi5qxb.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference";
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const app = Fastify({ logger: false });
const asrMaxSessionMs = 2 * 60 * 1000;
const projectRoot = resolve(import.meta.dirname, "../../..");
const appDataDir = resolve(process.env.APP_DATA_DIR ?? resolve(projectRoot, "var"));
const asrConfigPath = resolve(appDataDir, "config", "asr-settings.json");
const legacyAsrConfigPath = resolve(projectRoot, "apps", "server", "var", "config", "asr-settings.json");

const startMessage = z.object({
  type: z.literal("start"),
});

const asrConfigInput = z.object({
  apiKey: z.string().trim().min(12).max(512).optional(),
  endpoint: z.string().trim().min(1).max(512),
});

const storedAsrConfig = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  endpoint: z.string().trim().min(1).max(512),
  apiKey: z.string().trim().min(12).max(512),
});

type StoredAsrConfig = z.infer<typeof storedAsrConfig>;

type ClientSocket = WebSocket;
type UpstreamSocket = WebSocket;

function send(socket: ClientSocket, payload: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function publicError(socket: ClientSocket, code: string, message: string) {
  send(socket, { type: "error", code, message });
}

function isAllowedAliyunEndpoint(value: string): boolean {
  try {
    const endpoint = new URL(value);
    const pathname = endpoint.pathname.replace(/\/$/, "");
    return (
      endpoint.protocol === "wss:" &&
      endpoint.hostname.endsWith(".maas.aliyuncs.com") &&
      pathname === "/api-ws/v1/inference"
    );
  } catch {
    return false;
  }
}

async function readAsrConfigAt(path: string): Promise<StoredAsrConfig | undefined> {
  try {
    const contents = await readFile(path, "utf8");
    const parsed = storedAsrConfig.safeParse(JSON.parse(contents));
    return parsed.success && isAllowedAliyunEndpoint(parsed.data.endpoint) ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function readAsrConfig(): Promise<StoredAsrConfig | undefined> {
  const currentConfig = await readAsrConfigAt(asrConfigPath);
  if (currentConfig) return currentConfig;

  const legacyConfig = await readAsrConfigAt(legacyAsrConfigPath);
  if (!legacyConfig) return undefined;

  await saveAsrConfig(legacyConfig);
  await unlink(legacyAsrConfigPath).catch(() => undefined);
  return legacyConfig;
}

async function saveAsrConfig(config: StoredAsrConfig): Promise<void> {
  const configDirectory = dirname(asrConfigPath);
  await mkdir(configDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${asrConfigPath}.${randomUUID()}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, asrConfigPath);
  await chmod(asrConfigPath, 0o600);
}

function parseText(raw: RawData): string {
  return Buffer.isBuffer(raw) ? raw.toString("utf8") : raw.toString();
}

function asrTaskMessage(taskId: string) {
  return {
    header: { action: "run-task", task_id: taskId, streaming: "duplex" },
    payload: {
      task_group: "audio",
      task: "asr",
      function: "recognition",
      model: "fun-asr-realtime",
      parameters: {
        format: "pcm",
        sample_rate: 16000,
        language: "zh",
        max_sentence_silence: 900,
        heartbeat: true,
      },
      input: {},
    },
  };
}

function finishTaskMessage(taskId: string) {
  return {
    header: { action: "finish-task", task_id: taskId, streaming: "duplex" },
    payload: { input: {} },
  };
}

async function registerAsrProxy() {
  await app.register(fastifyWebsocket);

  app.get("/api/asr/config", async () => {
    const config = await readAsrConfig();
    const hasEnvironmentKey = Boolean(process.env.DASHSCOPE_API_KEY?.startsWith("sk-"));
    return {
      endpoint: config?.endpoint ?? defaultEndpoint,
      isConfigured: Boolean(config?.apiKey) || hasEnvironmentKey,
      storage: config ? "local-file" : hasEnvironmentKey ? "environment" : "none",
    };
  });

  app.put("/api/asr/config", async (request, reply) => {
    const input = asrConfigInput.safeParse(request.body);
    if (!input.success || !isAllowedAliyunEndpoint(input.data.endpoint)) {
      return reply.code(400).send({
        code: "INVALID_ENDPOINT",
        message: "请使用阿里云百炼业务空间的安全 WebSocket 地址。",
      });
    }

    const existing = await readAsrConfig();
    const apiKey = input.data.apiKey || existing?.apiKey;
    if (!apiKey?.startsWith("sk-")) {
      return reply.code(400).send({
        code: "API_KEY_REQUIRED",
        message: "首次保存需要粘贴有效的阿里云 API Key。",
      });
    }

    await saveAsrConfig({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      endpoint: input.data.endpoint,
      apiKey,
    });

    return { endpoint: input.data.endpoint, isConfigured: true, storage: "local-file" };
  });

  app.get("/api/asr/stream", { websocket: true }, (client) => {
    let upstream: UpstreamSocket | undefined;
    let taskId: string | undefined;
    let upstreamReady = false;
    let closing = false;
    let connectTimeout: NodeJS.Timeout | undefined;
    let sessionLimitTimeout: NodeJS.Timeout | undefined;

    const teardown = () => {
      if (connectTimeout) clearTimeout(connectTimeout);
      if (sessionLimitTimeout) clearTimeout(sessionLimitTimeout);
      if (upstream && upstream.readyState < WebSocket.CLOSING) upstream.close();
      upstream = undefined;
      taskId = undefined;
      upstreamReady = false;
    };

    const finish = (label = "正在整理最后一句…") => {
      if (!upstream || !taskId || closing) return;
      closing = true;
      if (sessionLimitTimeout) clearTimeout(sessionLimitTimeout);
      send(client, { type: "status", status: "finishing", label });
      upstream.send(JSON.stringify(finishTaskMessage(taskId)));
    };

    const start = async () => {
      teardown();
      closing = false;

      const config = await readAsrConfig();
      const endpoint = config?.endpoint || defaultEndpoint;
      if (!isAllowedAliyunEndpoint(endpoint)) {
        publicError(
          client,
          "INVALID_ENDPOINT",
          "实时识别地址无效。请使用阿里云百炼业务空间的 wss://…maas.aliyuncs.com/api-ws/v1/inference 地址。",
        );
        return;
      }

      let apiKey = config?.apiKey || process.env.DASHSCOPE_API_KEY || "";
      if (!apiKey.startsWith("sk-")) {
        publicError(client, "API_KEY_REQUIRED", "请粘贴有效的阿里云 API Key 后再开始识别。");
        return;
      }

      taskId = randomUUID().replace(/-/g, "").slice(0, 32);
      send(client, { type: "status", status: "connecting", label: "正在连接识别引擎…" });

      // The key is used only for the upstream handshake. It is never written to disk,
      // echoed back to the browser, or passed to application logging.
      upstream = new WebSocket(endpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
        handshakeTimeout: 12_000,
      });
      apiKey = "";

      connectTimeout = setTimeout(() => {
        if (!upstreamReady) {
          publicError(client, "ASR_TIMEOUT", "连接识别服务超时，请检查网络、区域地址和 API Key。\n");
          teardown();
        }
      }, 15_000);

      upstream.on("open", () => {
        if (!upstream || !taskId) return;
        upstream.send(JSON.stringify(asrTaskMessage(taskId)));
      });

      upstream.on("message", (data) => {
        let event: {
          header?: { event?: string; error_code?: string; error_message?: string };
          payload?: {
            output?: {
              sentence?: {
                text?: string;
                sentence_id?: number;
                sentence_end?: boolean;
                heartbeat?: boolean;
              };
            };
            usage?: { duration?: number } | null;
          };
        };

        try {
          event = JSON.parse(parseText(data));
        } catch {
          publicError(client, "ASR_PROTOCOL_ERROR", "识别服务返回了无法读取的消息。");
          return;
        }

        const kind = event.header?.event;
        if (kind === "task-started") {
          upstreamReady = true;
          if (connectTimeout) clearTimeout(connectTimeout);
          send(client, { type: "ready", label: "识别引擎已就绪，可以开始说话。单次最多 2 分钟。" });
          sessionLimitTimeout = setTimeout(() => {
            if (!upstreamReady || closing) return;
            send(client, { type: "limit", label: "已达到单次 2 分钟上限，正在停止识别。" });
            finish("已达到单次 2 分钟上限，正在整理最后一句…");
          }, asrMaxSessionMs);
          return;
        }

        if (kind === "result-generated") {
          const sentence = event.payload?.output?.sentence;
          if (!sentence || sentence.heartbeat) return;
          send(client, {
            type: "result",
            text: sentence.text ?? "",
            sentenceId: sentence.sentence_id ?? 0,
            isFinal: Boolean(sentence.sentence_end),
            duration: event.payload?.usage?.duration,
          });
          return;
        }

        if (kind === "task-finished") {
          send(client, { type: "finished", label: "识别完成。" });
          teardown();
          return;
        }

        if (kind === "task-failed") {
          publicError(
            client,
            event.header?.error_code || "ASR_TASK_FAILED",
            event.header?.error_message || "识别服务未能完成本次任务。",
          );
          teardown();
        }
      });

      upstream.on("error", () => {
        publicError(client, "ASR_CONNECTION_FAILED", "无法连接识别服务，请检查 API Key、地址和网络。");
        teardown();
      });

      upstream.on("close", () => {
        const unexpectedlyClosed = !closing && upstreamReady;
        teardown();
        if (unexpectedlyClosed) {
          send(client, { type: "status", status: "closed", label: "识别连接已关闭。" });
        }
      });
    };

    client.on("message", (raw, isBinary) => {
      if (isBinary) {
        if (!upstream || !upstreamReady || upstream.readyState !== WebSocket.OPEN) {
          publicError(client, "ASR_NOT_READY", "识别引擎尚未准备好，请稍候再开始说话。\n");
          return;
        }
        upstream.send(raw, { binary: true });
        return;
      }

      try {
        const message: unknown = JSON.parse(parseText(raw));
        if (typeof message !== "object" || message === null || !("type" in message)) {
          throw new Error("Missing command type");
        }

        if (message.type === "start") {
          const parsed = startMessage.safeParse(message);
          if (!parsed.success) {
            publicError(client, "API_KEY_REQUIRED", "请粘贴有效的阿里云 API Key 后再开始识别。");
            return;
          }
          void start();
          return;
        }

        if (message.type === "stop") {
          finish();
          return;
        }

        throw new Error("Unknown command type");
      } catch {
        publicError(client, "INVALID_COMMAND", "语音测试页面发送了无效请求。请刷新页面后重试。");
      }
    });

    client.on("close", teardown);
    client.on("error", teardown);
  });
}

async function main() {
  await registerAsrProxy();

  app.get("/api/health", async () => ({ status: "ok", service: "mumu-asr" }));

  const webDist = resolve(import.meta.dirname, "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
  }

  await app.listen({ port, host });
}

main().catch(() => {
  // Keep startup failures free of request payloads and credentials.
  process.exitCode = 1;
});
