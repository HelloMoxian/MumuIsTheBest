import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
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

const startMessage = z.object({
  type: z.literal("start"),
  apiKey: z.string().trim().min(12).max(512).optional(),
  endpoint: z.string().trim().min(1).max(512).optional(),
});

const commandMessage = z.discriminatedUnion("type", [
  startMessage,
  z.object({ type: z.literal("stop") }),
]);

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

  app.get("/api/asr/stream", { websocket: true }, (client) => {
    let upstream: UpstreamSocket | undefined;
    let taskId: string | undefined;
    let upstreamReady = false;
    let closing = false;
    let connectTimeout: NodeJS.Timeout | undefined;

    const teardown = () => {
      if (connectTimeout) clearTimeout(connectTimeout);
      if (upstream && upstream.readyState < WebSocket.CLOSING) upstream.close();
      upstream = undefined;
      taskId = undefined;
      upstreamReady = false;
    };

    const finish = () => {
      if (!upstream || !taskId || closing) return;
      closing = true;
      send(client, { type: "status", status: "finishing", label: "正在整理最后一句…" });
      upstream.send(JSON.stringify(finishTaskMessage(taskId)));
    };

    const start = (input: z.infer<typeof startMessage>) => {
      teardown();
      closing = false;

      const endpoint = input.endpoint || defaultEndpoint;
      if (!isAllowedAliyunEndpoint(endpoint)) {
        publicError(
          client,
          "INVALID_ENDPOINT",
          "实时识别地址无效。请使用阿里云百炼业务空间的 wss://…maas.aliyuncs.com/api-ws/v1/inference 地址。",
        );
        return;
      }

      let apiKey = input.apiKey || process.env.DASHSCOPE_API_KEY || "";
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
          send(client, { type: "ready", label: "识别引擎已就绪，可以开始说话。" });
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
      });

      upstream.on("close", () => {
        if (!closing && upstreamReady) {
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
        const message = commandMessage.parse(JSON.parse(parseText(raw)));
        if (message.type === "start") start(message);
        if (message.type === "stop") finish();
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
