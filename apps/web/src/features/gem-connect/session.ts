import { newGame, type Game } from "./engine";
import { GEMS, LEVELS, RULES_VERSION } from "./logic";

const PREFIX = `mumu:gem-connect:session:v1:rules${RULES_VERSION}:`;
type StoragePort = Pick<Storage, "getItem" | "setItem">;
const validLevel = (value: number) => Number.isInteger(value) && value >= 1 && value <= LEVELS.length;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Each level is independent; inactive time is never added to its clock. */
export class GemSessions {
  private games = new Map<number, Game>();
  private written = new Map<number, Game>();
  constructor(private storage?: StoragePort) {}

  activeLevel() {
    try { const level = Number(this.storage?.getItem(PREFIX + "active")); return validLevel(level) ? level : 1; }
    catch { return 1; }
  }

  load(level: number): Game {
    const cached = this.games.get(level);
    if (cached) return cached;
    try {
      const saved = JSON.parse(this.storage?.getItem(PREFIX + level) ?? "null");
      const g = saved?.game as Game | undefined;
      const config = LEVELS[level - 1];
      if (saved?.schemaVersion === 1 && saved.rulesVersion === RULES_VERSION && g && g.level === level
        && typeof g.id === "string" && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(g.id)
        && g.board?.rows === config.rows && g.board.cols === config.cols && Array.isArray(g.board.tiles)
        && g.board.tiles.length === config.rows * config.cols
        && g.board.tiles.every(t => t === null || (Number.isInteger(t) && t >= 0 && t < GEMS.length))
        && GEMS.every((_, kind) => g.board.tiles.filter(t => t === kind).length % 2 === 0)
        && [g.elapsed, g.lastMatchMs, g.hints, g.shuffles].every(nonnegative)
        && g.lastMatchMs <= g.elapsed && Number.isSafeInteger(g.hints) && Number.isSafeInteger(g.shuffles)
        && ["entering", "playing", "settling", "celebrating", "complete", "paused"].includes(g.phase)
        && ["entering", "playing", "settling", "celebrating", "complete"].includes(g.resumePhase)) {
        const complete = g.board.tiles.every(t => t === null);
        const phase = complete ? "complete" : g.phase === "paused" ? "paused" : g.phase === "settling" ? "settling" : "playing";
        const restored: Game = { ...g, phase, resumePhase: g.resumePhase === "settling" ? "settling" : "playing",
          phaseMs: 0, matches: [], selected: null, hint: [], entrance: 0,
          completion: complete ? { id: g.id, level, rulesVersion: RULES_VERSION, durationMs: Math.max(1, Math.round(g.elapsed)), hints: g.hints, shuffles: g.shuffles, pairCount: g.board.tiles.length / 2 } : null,
          message: complete ? "这一关点亮啦！可以开始新一局。" : "接着上次的星光，继续连吧！" };
        this.games.set(level, restored);
        return restored;
      }
    } catch { /* Missing, invalid or unavailable storage only affects this level. */ }
    const game = newGame(level);
    this.games.set(level, game);
    return game;
  }

  save(game: Game, force = false) {
    this.games.set(game.level, game);
    const last = this.written.get(game.level);
    if (!force && last && last.id === game.id && last.board === game.board && last.phase === game.phase
      && last.hints === game.hints && last.shuffles === game.shuffles && game.elapsed - last.elapsed < 1000) return;
    try {
      this.storage?.setItem(PREFIX + game.level, JSON.stringify({ schemaVersion: 1, rulesVersion: RULES_VERSION, updatedAt: new Date().toISOString(), game }));
      this.storage?.setItem(PREFIX + "active", String(game.level));
      this.written.set(game.level, game);
    } catch { /* Keep in-memory progress even when browser storage is full or blocked. */ }
  }

  restart(level: number) { const game = newGame(level); this.save(game, true); return game; }
}

export function browserSessions() {
  try { return new GemSessions(window.localStorage); }
  catch { return new GemSessions(); }
}
