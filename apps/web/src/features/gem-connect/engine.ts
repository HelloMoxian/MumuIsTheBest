import { createBoard, entryDelay, findMove, findPath, shuffleBoard, ENTRY_ANIMATION_MS, LEVEL_TRANSITION_MS, MATCH_ANIMATION_MS, RULES_VERSION, needsIdleHint, type Board, type Completion, type Point } from "./logic";
export type Phase = "entering" | "playing" | "settling" | "celebrating" | "complete" | "paused";
export type MatchAnimation = { a: number; b: number; kind: number; path: Point[]; elapsedMs: number };
export type Game = {
  id: string; level: number; board: Board; phase: Phase; resumePhase: Phase;
  phaseMs: number; elapsed: number; lastMatchMs: number;
  selected: number | null; hint: number[]; hints: number; shuffles: number;
  matches: MatchAnimation[];
  entrance: number; completion: Completion | null; message: string;
};
export function newGame(level: number, id = crypto.randomUUID()): Game {
  return { id, level, board: createBoard(level), phase: "entering", resumePhase: "playing",
    phaseMs: 0, elapsed: 0, lastMatchMs: 0, selected: null, hint: [], hints: 0, shuffles: 0,
    matches: [], entrance: 0, completion: null, message: "点两颗一样的宝石，连线最多拐两次。" };
}
export function tickGame(game: Game, delta: number, reduced = false): Game {
  if (game.phase === "paused" || game.phase === "complete") return game;
  const step = Math.max(0, delta);
  const next = { ...game, phaseMs: game.phaseMs + step,
    matches: game.matches.map(match => ({ ...match, elapsedMs: match.elapsedMs + step }))
      .filter(match => match.elapsedMs < (reduced ? 100 : MATCH_ANIMATION_MS)) };
  if (game.phase === "playing") {
    next.elapsed += step;
    if (needsIdleHint(next.elapsed, next.lastMatchMs, next.hint.length > 0)) {
      next.hint = findMove(next.board) ?? [];
    }
  }
  if (game.phase === "entering" && next.phaseMs >= (reduced ? 0 : ENTRY_ANIMATION_MS)) {
    next.phase = "playing"; next.phaseMs = 0;
  }
  // Only wait when no playable pair remains. Each earlier match retires independently.
  if (game.phase === "settling" && next.matches.length === 0) {
    next.phaseMs = 0;
    if (next.board.tiles.every(tile => tile === null)) {
      next.phase = "celebrating";
      next.completion = { id: next.id, rulesVersion: RULES_VERSION, level: next.level,
        durationMs: Math.max(1, Math.round(next.elapsed)), hints: next.hints, shuffles: next.shuffles, pairCount: next.board.tiles.length / 2 };
      next.message = "这一关点亮啦！";
    } else {
      next.board = shuffleBoard(next.board); next.shuffles++; next.entrance++;
      next.phase = "entering"; next.message = "宝石换好位置啦，接着连！";
    }
  }
  if (game.phase === "celebrating" && next.phaseMs >= LEVEL_TRANSITION_MS) next.phase = "complete";
  return next;
}
export function pickGem(game: Game, index: number): Game {
  if (game.phase !== "playing" || !Number.isInteger(index) || index < 0 || index >= game.board.tiles.length || game.board.tiles[index] === null) return game;
  if (game.selected === null || game.selected === index) return { ...game, selected: game.selected === index ? null : index };
  const path = findPath(game.board, game.selected, index);
  if (!path) return { ...game, selected: index, message: "试试另一对，星星会帮你找到伙伴。" };
  const a = game.selected, kind = game.board.tiles[index]!;
  const tiles = [...game.board.tiles]; tiles[a] = null; tiles[index] = null;
  const board = { ...game.board, tiles };
  // Clear logical cells immediately; the view keeps a separate visual copy until its animation ends.
  return { ...game, board, phase: findMove(board) ? "playing" : "settling", phaseMs: 0,
    selected: null, hint: [], lastMatchMs: game.elapsed,
    matches: [...game.matches, { a, b: index, kind, path, elapsedMs: 0 }], message: "星光连起来啦！" };
}
export function pauseGame(game: Game): Game {
  if (game.phase === "paused" || game.phase === "complete") return game;
  return { ...game, resumePhase: game.phase, phase: "paused" };
}
export function resumeGame(game: Game): Game {
  return game.phase === "paused" ? { ...game, phase: game.resumePhase } : game;
}
export function hintGame(game: Game): Game {
  if (game.phase !== "playing") return game;
  return { ...game, hint: findMove(game.board) ?? [], selected: null, hints: game.hints + 1 };
}
export function shuffleGame(game: Game): Game {
  if (game.phase !== "playing") return game;
  return { ...game, board: shuffleBoard(game.board), phase: "entering", phaseMs: 0, matches: [],
    selected: null, hint: [], lastMatchMs: game.elapsed, shuffles: game.shuffles + 1, entrance: game.entrance + 1 };
}
export { entryDelay };
