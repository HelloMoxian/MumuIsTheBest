import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";
import {
  defaultAppDataDirectory,
  initializeAppDataDirectory,
  resolveAppDataDirectory,
} from "./app-data.js";
import { registerArithmeticBattleHistoryApi } from "./arithmetic-battle-history.js";
import { registerCommonCharacterProgressApi } from "./common-character-progress.js";
import { registerEnglishEchoIslandApi } from "./english-echo-island.js";
import { registerFruitSliceHistoryApi } from "./fruit-slice-history.js";
import { registerMathKnowledgeTowerApi } from "./math-knowledge-tower.js";
import { registerMultiplicationHistoryApi } from "./multiplication-history.js";
import { registerPersistentUserDataApi } from "./persistent-user-data.js";
import { registerWorldTowerApi } from "./world-tower.js";

const defaultEndpoint =
  process.env.ASR_WEBSOCKET_URL ??
  "wss://llm-v5rvizd868hi5qxb.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference";
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const app = Fastify({ logger: false });
const asrMaxSessionMs = 10 * 60 * 1000;
const projectRoot = resolve(import.meta.dirname, "../../..");
const appDataDir = resolveAppDataDirectory(projectRoot);
const defaultDataDir = defaultAppDataDirectory(projectRoot);
const asrConfigPath = resolve(appDataDir, "config", "asr-settings.json");
const legacyAsrConfigPath = resolve(projectRoot, "apps", "server", "var", "config", "asr-settings.json");
const addSubtractHistoryPath = resolve(appDataDir, "learning", "math", "add-subtract-history.json");

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

const operationTypeSchema = z.enum(["addition", "subtraction", "mixed"]);
const completedQuestionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  left: z.number().int().min(0).max(20),
  right: z.number().int().min(0).max(20),
  operator: z.enum(["+", "-"]),
  answer: z.number().int().min(0).max(20),
  firstAttemptCorrect: z.boolean(),
  calculationDurationMs: z.number().int().min(0).max(30 * 60 * 1000),
  wrongAnswers: z.array(z.number().int().min(0).max(999_999_999_999)).max(100),
}).superRefine((question, context) => {
  const expected = question.operator === "+" ? question.left + question.right : question.left - question.right;
  if (expected !== question.answer || expected < 0 || expected > 20) {
    context.addIssue({ code: "custom", message: "题目不符合 0 至 20 的加减练习规则。" });
  }
  if (question.firstAttemptCorrect !== (question.wrongAnswers.length === 0)) {
    context.addIssue({ code: "custom", message: "本题首次正确标记与错误答案记录不一致。" });
  }
});

const practiceSessionInputSchema = z.object({
  startedAt: z.string().datetime(),
  questionCount: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  operationType: operationTypeSchema,
  speechType: z.enum(["none", "zh", "en"]),
  childAge: z.number().min(0).max(18),
  totalDurationMs: z.number().int().min(0).max(2 * 60 * 60 * 1000),
  calculationDurationMs: z.number().int().min(0).max(2 * 60 * 60 * 1000),
  questions: z.array(completedQuestionSchema).min(5).max(20),
}).superRefine((session, context) => {
  if (session.questions.length !== session.questionCount) {
    context.addIssue({ code: "custom", message: "已完成题目数量与本局配置不一致。" });
  }
  if (session.calculationDurationMs > session.totalDurationMs) {
    context.addIssue({ code: "custom", message: "计算时间不能超过总耗时。" });
  }
  const operators = new Set(session.questions.map((question) => question.operator));
  if (
    (session.operationType === "addition" && (operators.size !== 1 || !operators.has("+"))) ||
    (session.operationType === "subtraction" && (operators.size !== 1 || !operators.has("-"))) ||
    (session.operationType === "mixed" && (!operators.has("+") || !operators.has("-")))
  ) {
    context.addIssue({ code: "custom", message: "本局题目与所选题目类型不一致。" });
  }
  if (new Set(session.questions.map((question) => question.id)).size !== session.questions.length) {
    context.addIssue({ code: "custom", message: "本局不能包含重复题目 ID。" });
  }
  const expressions = session.questions.map(
    (question) => `${question.left}:${question.operator}:${question.right}`,
  );
  if (new Set(expressions).size !== expressions.length) {
    context.addIssue({ code: "custom", message: "同一局不能重复出现相同算式。" });
  }
});

const storedPracticeSessionSchema = practiceSessionInputSchema.extend({
  id: z.string().uuid(),
  completedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  correctCount: z.number().int().min(0).max(20),
  accuracy: z.number().min(0).max(1),
});

const addSubtractHistorySchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  sessions: z.array(storedPracticeSessionSchema),
});

type StoredAsrConfig = z.infer<typeof storedAsrConfig>;
type AddSubtractHistory = z.infer<typeof addSubtractHistorySchema>;

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

function emptyAddSubtractHistory(): AddSubtractHistory {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), sessions: [] };
}

async function readAddSubtractHistory(): Promise<AddSubtractHistory> {
  try {
    const contents = await readFile(addSubtractHistoryPath, "utf8");
    return addSubtractHistorySchema.parse(JSON.parse(contents));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyAddSubtractHistory();
    throw error;
  }
}

async function saveAddSubtractHistory(history: AddSubtractHistory): Promise<void> {
  const historyDirectory = dirname(addSubtractHistoryPath);
  await mkdir(historyDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${addSubtractHistoryPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, addSubtractHistoryPath);
  await chmod(addSubtractHistoryPath, 0o600);
}

let historyWriteQueue: Promise<void> = Promise.resolve();

function appendPracticeSession(input: z.infer<typeof practiceSessionInputSchema>) {
  const operation = historyWriteQueue.then(async () => {
    const history = await readAddSubtractHistory();
    const now = new Date().toISOString();
    const correctCount = input.questions.filter((question) => question.firstAttemptCorrect).length;
    const session = storedPracticeSessionSchema.parse({
      ...input,
      id: randomUUID(),
      completedAt: now,
      createdAt: now,
      updatedAt: now,
      correctCount,
      accuracy: correctCount / input.questionCount,
    });
    await saveAddSubtractHistory({
      schemaVersion: 1,
      updatedAt: now,
      sessions: [...history.sessions, session],
    });
    return session;
  });

  historyWriteQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function registerMathPracticeApi() {
  app.get("/api/math/add-subtract/history", async (_request, reply) => {
    try {
      return await readAddSubtractHistory();
    } catch {
      return reply.code(500).send({
        code: "HISTORY_READ_FAILED",
        message: "历史记录暂时无法读取，请检查本机数据文件。",
      });
    }
  });

  app.post("/api/math/add-subtract/history", async (request, reply) => {
    const parsed = practiceSessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_PRACTICE_SESSION",
        message: "本局数据不完整或不符合加减练习规则，因此没有写入历史记录。",
      });
    }

    try {
      const session = await appendPracticeSession(parsed.data);
      return reply.code(201).send({ session });
    } catch {
      return reply.code(500).send({
        code: "HISTORY_WRITE_FAILED",
        message: "本局已经完成，但历史记录暂时无法保存。请让家长检查数据目录。",
      });
    }
  });
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
          send(client, { type: "ready", label: "识别引擎已就绪，可以开始说话。单次最多 10 分钟。" });
          sessionLimitTimeout = setTimeout(() => {
            if (!upstreamReady || closing) return;
            send(client, { type: "limit", label: "已达到单次 10 分钟上限，正在停止识别。" });
            finish("已达到单次 10 分钟上限，正在整理最后一句…");
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
  const migration = await initializeAppDataDirectory({
    appDataDir,
    legacyDataDir: appDataDir === defaultDataDir
      ? resolve(projectRoot, "var")
      : undefined,
  });
  await registerAsrProxy();
  registerMathPracticeApi();
  registerArithmeticBattleHistoryApi(app, appDataDir);
  registerMultiplicationHistoryApi(app, appDataDir);
  registerCommonCharacterProgressApi(app, appDataDir);
  registerPersistentUserDataApi(app, appDataDir);
  registerFruitSliceHistoryApi(app, appDataDir);
  registerWorldTowerApi(app, appDataDir, projectRoot);
  await registerEnglishEchoIslandApi(app, appDataDir, projectRoot);
  await registerMathKnowledgeTowerApi(app, appDataDir, projectRoot);

  app.get("/api/health", async () => ({ status: "ok", service: "mumu-asr" }));

  const webDist = resolve(import.meta.dirname, "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders(response, path) {
        if (/[\\/]assets[\\/]/.test(path)) {
          response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
    app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
  }

  console.info(`Mumu 本机数据目录：${appDataDir}`);
  if (migration.copiedFiles > 0) {
    console.info(`已从仓库内旧数据目录安全迁移 ${migration.copiedFiles} 个文件；旧文件未删除。`);
  }
  await app.listen({ port, host });
}

main().catch((error: unknown) => {
  // Keep startup failures free of request payloads and credentials.
  const message = error instanceof Error ? error.message : "未知启动错误";
  console.error(`Mumu 服务启动失败：${message}`);
  process.exitCode = 1;
});
