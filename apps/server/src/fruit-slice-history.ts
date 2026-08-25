import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const FRUIT_SLICE_ROLES = [
  "爸爸",
  "妈妈",
  "木木",
  "姥姥",
  "奶奶",
  "小姨",
] as const;

const roleSchema = z.enum(FRUIT_SLICE_ROLES);
const sideSchema = z.enum(["full", "left", "right"]);
const settingsSchema = z.object({
  durationSeconds: z.number().int().min(15).max(300),
  density: z.enum(["relaxed", "standard", "busy", "storm"]),
  speedMultiplier: z.number().min(0.6).max(1.8),
  fruitSize: z.number().int().min(56).max(256),
  includeBombs: z.boolean(),
  includeLobster: z.boolean(),
  swipeSensitivity: z.enum(["gentle", "standard", "strong"]),
});

const playerResultInputSchema = z.object({
  role: roleSchema,
  side: sideSchema,
  score: z.number().int().min(-1_000_000).max(10_000_000),
  fruitSlices: z.number().int().min(0).max(100_000),
  lobsterSlices: z.number().int().min(0).max(100_000),
  bombsHit: z.number().int().min(0).max(100_000),
  maxCombo: z.number().int().min(0).max(100_000),
  fastestSwipe: z.number().min(0).max(100),
  superActivations: z.number().int().min(0).max(100_000),
});

const sessionBaseSchema = z.object({
  eventId: z.string().uuid(),
  startedAt: z.string().datetime(),
  mode: z.enum(["single", "versus"]),
  durationMs: z.number().int().min(1_000).max(6 * 60 * 1_000),
  settings: settingsSchema,
  players: z.array(playerResultInputSchema).min(1).max(2),
});

const sessionInputSchema = sessionBaseSchema.superRefine((session, context) => {
  const expectedPlayers = session.mode === "single" ? 1 : 2;
  if (session.players.length !== expectedPlayers) {
    context.addIssue({ code: "custom", message: "玩家数量与本局模式不一致。" });
  }
  const expectedSides = session.mode === "single" ? ["full"] : ["left", "right"];
  const sides = [...session.players.map((player) => player.side)].sort();
  if (sides.join(",") !== [...expectedSides].sort().join(",")) {
    context.addIssue({ code: "custom", message: "玩家站位与本局模式不一致。" });
  }
  if (new Set(session.players.map((player) => player.role)).size !== session.players.length) {
    context.addIssue({ code: "custom", message: "双人模式需要选择两个不同角色。" });
  }
  if (session.durationMs > (session.settings.durationSeconds + 20) * 1_000) {
    context.addIssue({ code: "custom", message: "本局耗时超过了设置允许的范围。" });
  }
});

const storedPlayerResultSchema = playerResultInputSchema.extend({
  energyCoinsEarned: z.number().int().min(0).max(20),
});

const storedSessionSchema = sessionBaseSchema.omit({ eventId: true, players: true }).extend({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  completedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  winnerSide: z.enum(["left", "right", "tie"]).nullable(),
  players: z.array(storedPlayerResultSchema).min(1).max(2),
});

const energyCoinTransactionSchema = z.object({
  eventId: z.string().uuid(),
  kind: z.literal("nature:geology-hammer"),
  amount: z.literal(30),
  quantity: z.literal(1),
  createdAt: z.string().datetime(),
});

const historySchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  stableId: z.literal("game-fruit-slice-history"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  energyCoinBalance: z.number().int().min(0).max(1_000_000_000),
  sessions: z.array(storedSessionSchema).max(100_000),
  energyCoinTransactions: z.array(energyCoinTransactionSchema).max(100_000).default([]),
});

type History = z.infer<typeof historySchema>;
type SessionInput = z.infer<typeof sessionInputSchema>;
type StoredSession = z.infer<typeof storedSessionSchema>;

const STABLE_HISTORY_UUID = "e110a8ab-cd3d-4cd2-a673-26d0554fc280";
const ENERGY_SCORE_STEP = 500;
const GEOLOGY_HAMMER_COST = 30;
const energyCoinSpendInputSchema = z.object({
  eventId: z.string().uuid(),
  kind: z.literal("nature:geology-hammer"),
  amount: z.literal(GEOLOGY_HAMMER_COST),
  quantity: z.literal(1),
});

function emptyHistory(): History {
  const createdAt = new Date(0).toISOString();
  return {
    schemaVersion: 1,
    id: STABLE_HISTORY_UUID,
    stableId: "game-fruit-slice-history",
    createdAt,
    updatedAt: createdAt,
    energyCoinBalance: 0,
    sessions: [],
    energyCoinTransactions: [],
  };
}

export function energyCoinsForPlayer(role: string, score: number) {
  if (role !== "木木" || score < ENERGY_SCORE_STEP) return 0;
  return Math.min(20, Math.floor(score / ENERGY_SCORE_STEP));
}

function winnerSide(input: SessionInput): StoredSession["winnerSide"] {
  if (input.mode === "single") return null;
  const left = input.players.find((player) => player.side === "left")!;
  const right = input.players.find((player) => player.side === "right")!;
  if (left.score === right.score) return "tie";
  return left.score > right.score ? "left" : "right";
}

function historySummary(history: History) {
  const roles = FRUIT_SLICE_ROLES.map((role) => {
    const results = history.sessions.flatMap((session) => (
      session.players.filter((player) => player.role === role)
    ));
    return {
      role,
      gamesPlayed: results.length,
      highestScore: results.length ? Math.max(...results.map((result) => result.score)) : 0,
      totalScore: results.reduce((total, result) => total + result.score, 0),
      energyCoinsEarned: results.reduce((total, result) => total + result.energyCoinsEarned, 0),
    };
  });

  const matchupMap = new Map<string, {
    roleA: typeof FRUIT_SLICE_ROLES[number];
    roleB: typeof FRUIT_SLICE_ROLES[number];
    games: number;
    winsA: number;
    winsB: number;
    ties: number;
  }>();
  for (const session of history.sessions) {
    if (session.mode !== "versus") continue;
    const [first, second] = session.players;
    const [roleA, roleB] = [first.role, second.role].sort((left, right) => (
      FRUIT_SLICE_ROLES.indexOf(left) - FRUIT_SLICE_ROLES.indexOf(right)
    )) as [
      typeof FRUIT_SLICE_ROLES[number],
      typeof FRUIT_SLICE_ROLES[number],
    ];
    const key = `${roleA}\u0000${roleB}`;
    const matchup = matchupMap.get(key) ?? { roleA, roleB, games: 0, winsA: 0, winsB: 0, ties: 0 };
    matchup.games += 1;
    if (first.score === second.score) matchup.ties += 1;
    else {
      const winnerRole = first.score > second.score ? first.role : second.role;
      if (winnerRole === roleA) matchup.winsA += 1;
      else matchup.winsB += 1;
    }
    matchupMap.set(key, matchup);
  }

  return { roles, matchups: [...matchupMap.values()] };
}

export function registerFruitSliceHistoryApi(app: FastifyInstance, appDataDir: string) {
  const historyPath = resolve(appDataDir, "learning", "games", "fruit-slice-history.json");
  let writeQueue: Promise<void> = Promise.resolve();

  async function readHistory(): Promise<History> {
    try {
      return historySchema.parse(JSON.parse(await readFile(historyPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyHistory();
      throw error;
    }
  }

  async function saveHistory(history: History) {
    await mkdir(dirname(historyPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${historyPath}.${history.updatedAt.replaceAll(":", "-")}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(history, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, historyPath);
    await chmod(historyPath, 0o600);
  }

  function appendSession(input: SessionInput) {
    const operation = writeQueue.then(async () => {
      const history = await readHistory();
      const existing = history.sessions.find((session) => session.eventId === input.eventId);
      if (existing) return { history, session: existing, alreadySaved: true };

      const now = new Date().toISOString();
      const players = input.players.map((player) => ({
        ...player,
        energyCoinsEarned: energyCoinsForPlayer(player.role, player.score),
      }));
      const session = storedSessionSchema.parse({
        ...input,
        id: input.eventId,
        players,
        winnerSide: winnerSide(input),
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const energyCoinsEarned = players.reduce((total, player) => total + player.energyCoinsEarned, 0);
      const next = historySchema.parse({
        ...history,
        updatedAt: now,
        energyCoinBalance: history.energyCoinBalance + energyCoinsEarned,
        sessions: [...history.sessions, session],
      });
      await saveHistory(next);
      return { history: next, session, alreadySaved: false };
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function spendEnergyCoins(
    input: z.infer<typeof energyCoinSpendInputSchema>,
  ) {
    const operation = writeQueue.then(async () => {
      const history = await readHistory();
      const existing = history.energyCoinTransactions.find(
        (transaction) => transaction.eventId === input.eventId,
      );
      if (existing) return { history, alreadySpent: true, insufficient: false };
      if (history.energyCoinBalance < input.amount) {
        return { history, alreadySpent: false, insufficient: true };
      }
      const now = new Date().toISOString();
      const next = historySchema.parse({
        ...history,
        updatedAt: now,
        energyCoinBalance: history.energyCoinBalance - input.amount,
        energyCoinTransactions: [...history.energyCoinTransactions, {
          ...input,
          createdAt: now,
        }],
      });
      await saveHistory(next);
      return { history: next, alreadySpent: false, insufficient: false };
    });
    writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  app.get("/api/games/fruit-slice/history", async (_request, reply) => {
    try {
      const history = await readHistory();
      return { ...history, summary: historySummary(history) };
    } catch {
      return reply.code(500).send({
        code: "FRUIT_SLICE_HISTORY_READ_FAILED",
        message: "切水果战报暂时无法读取，请让家长检查本机数据目录。",
      });
    }
  });

  app.get("/api/games/fruit-slice/energy-coins", async (_request, reply) => {
    try {
      const history = await readHistory();
      return {
        schemaVersion: 1,
        balance: history.energyCoinBalance,
        updatedAt: history.updatedAt,
      };
    } catch {
      return reply.code(500).send({
        code: "ENERGY_COIN_READ_FAILED",
        message: "能量币余额暂时无法读取，请让家长检查本机数据目录。",
      });
    }
  });

  app.post("/api/games/fruit-slice/energy-coins/spend", async (request, reply) => {
    const parsed = energyCoinSpendInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_ENERGY_COIN_SPEND",
        message: "这次地质锤购买不符合玩法规则，因此没有扣除能量币。",
      });
    }
    try {
      const result = await spendEnergyCoins(parsed.data);
      if (result.insufficient) {
        return reply.code(409).send({
          code: "INSUFFICIENT_ENERGY_COINS",
          message: "能量币还不够，完成体感游戏获得 30 枚能量币后再购买地质锤。",
          balance: result.history.energyCoinBalance,
        });
      }
      return reply.code(result.alreadySpent ? 200 : 201).send({
        alreadySpent: result.alreadySpent,
        eventId: parsed.data.eventId,
        quantity: 1,
        coinDelta: result.alreadySpent ? 0 : -parsed.data.amount,
        balance: result.history.energyCoinBalance,
        updatedAt: result.history.updatedAt,
      });
    } catch {
      return reply.code(500).send({
        code: "ENERGY_COIN_SPEND_FAILED",
        message: "地质锤暂时无法购买，请让家长检查本机数据目录。",
      });
    }
  });

  app.post("/api/games/fruit-slice/history", async (request, reply) => {
    const parsed = sessionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_FRUIT_SLICE_SESSION",
        message: "本局战报不完整或不符合切水果规则，因此没有保存。",
      });
    }
    try {
      const result = await appendSession(parsed.data);
      const energyCoinsEarned = result.session.players.reduce(
        (total, player) => total + player.energyCoinsEarned,
        0,
      );
      return reply.code(result.alreadySaved ? 200 : 201).send({
        alreadySaved: result.alreadySaved,
        session: result.session,
        energyCoinsEarned: result.alreadySaved ? 0 : energyCoinsEarned,
        energyCoinBalance: result.history.energyCoinBalance,
        summary: historySummary(result.history),
      });
    } catch {
      return reply.code(500).send({
        code: "FRUIT_SLICE_HISTORY_WRITE_FAILED",
        message: "本局已经结束，但战报暂时无法保存，请让家长检查本机数据目录。",
      });
    }
  });
}
