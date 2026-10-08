export const SKINS = ["gems", "elements", "crystal", "voxel", "aurora"] as const;
export const TRACKS = ["mix", "prism", "orbit", "garden", "tide", "puzzling", "scifi", "solar"] as const;
export type Config = {
  width: number; height: number; target: number; speed: number; increment: number;
  kinds: number[]; skin: typeof SKINS[number]; music: boolean; effects: boolean;
  track: typeof TRACKS[number]; volume: number; effectVolume: number;
};
export const DEFAULT_CONFIG: Config = {
  width: 15, height: 15, target: 60, speed: 1, increment: .15, kinds: [0, 1, 2, 3, 4, 5],
  skin: "gems", music: true, effects: true, track: "mix", volume: .2, effectVolume: .4,
};
export type Piece = { x: number; y: number; gems: number[] };
export type Game = {
  config: Config; board: (number | null)[]; active: Piece | null; next: number[]; seed: number;
  phase: "falling" | "clearing" | "settling" | "over"; matches: number[]; wait: number;
  score: number; cleared: number; chain: number; bestChain: number; pieces: number;
};
export type Action = "left" | "right" | "down" | "rotate" | "reverse" | "drop";
export const level = (g: Game) => 1 + Math.floor(g.cleared / g.config.target);
export const speed = (g: Game) => g.config.speed === 0 ? 0 : Math.min(20, g.config.speed + (level(g) - 1) * g.config.increment);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const number = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function validConfig(v: unknown): v is Config {
  if (!v || typeof v !== "object") return false;
  const c = v as Config;
  return integer(c.width, 6, 15) && integer(c.height, 10, 20) && integer(c.target, 3, 9999)
    && number(c.speed, 0, 10) && number(c.increment, 0, 5) && Array.isArray(c.kinds)
    && c.kinds.length >= 2 && c.kinds.length <= 7 && new Set(c.kinds).size === c.kinds.length
    && c.kinds.every(n => integer(n, 0, 6)) && SKINS.includes(c.skin) && TRACKS.includes(c.track)
    && typeof c.music === "boolean" && typeof c.effects === "boolean"
    && number(c.volume, 0, 1) && number(c.effectVolume, 0, 1);
}
function randomGem(g: Game): number {
  g.seed = (Math.imul(g.seed, 1664525) + 1013904223) >>> 0;
  return g.config.kinds[Math.floor(g.seed / 4294967296 * g.config.kinds.length)];
}
function triple(g: Game) { return [randomGem(g), randomGem(g), randomGem(g)]; }
export function fits(g: Game, p: Piece): boolean {
  return p.x >= 0 && p.x < g.config.width && p.y >= 0 && p.y + 2 < g.config.height
    && p.gems.every((_, i) => g.board[(p.y + i) * g.config.width + p.x] === null);
}
function spawn(g: Game): Game {
  const active = { x: Math.floor(g.config.width / 2), y: 0, gems: g.next };
  g.active = fits(g, active) ? active : null;
  g.phase = g.active ? "falling" : "over";
  g.next = triple(g); g.wait = 0; g.chain = 0;
  return g;
}
export function createGame(config: Config = DEFAULT_CONFIG, seed = Math.floor(Math.random() * 4294967296)): Game {
  if (!validConfig(config)) throw new Error("玩法设置超出范围");
  const g: Game = { config: { ...config, kinds: [...config.kinds] }, board: Array(config.width * config.height).fill(null),
    active: null, next: [], seed: seed >>> 0, phase: "falling", matches: [], wait: 0,
    score: 0, cleared: 0, chain: 0, bestChain: 0, pieces: 0 };
  g.next = triple(g);
  return spawn(g);
}
/** All four directions; intersecting runs form a set, never duplicate rewards. */
export function findMatches(board: (number | null)[], width: number, height: number): number[] {
  const found = new Set<number>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = board[y * width + x];
    if (value === null) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const px = x - dx, py = y - dy;
      if (px >= 0 && px < width && py >= 0 && board[py * width + px] === value) continue;
      const run: number[] = [];
      for (let a = x, b = y; a >= 0 && a < width && b < height && board[b * width + a] === value; a += dx, b += dy) run.push(b * width + a);
      if (run.length >= 3) run.forEach(i => found.add(i));
    }
  }
  return [...found].sort((a, b) => a - b);
}
export function gravity(board: (number | null)[], width: number, height: number) {
  const next: (number | null)[] = Array(board.length).fill(null);
  for (let x = 0; x < width; x++) {
    let to = height - 1;
    for (let y = height - 1; y >= 0; y--) {
      const gem = board[y * width + x];
      if (gem !== null) next[to-- * width + x] = gem;
    }
  }
  return next;
}
function resolve(g: Game): Game {
  g.matches = findMatches(g.board, g.config.width, g.config.height); g.wait = 0;
  if (g.matches.length) {
    g.phase = "clearing"; g.chain++; g.bestChain = Math.max(g.bestChain, g.chain);
    return g;
  }
  if (g.active) { g.phase = "falling"; g.chain = 0; return g; }
  return spawn(g);
}
export function ghost(g: Game): Piece | null {
  if (!g.active) return null;
  const p = { ...g.active };
  while (fits(g, { ...p, y: p.y + 1 })) p.y++;
  return p;
}
function lock(g: Game): Game {
  if (!g.active) return g;
  g.board = [...g.board];
  g.active.gems.forEach((gem, i) => { g.board[(g.active!.y + i) * g.config.width + g.active!.x] = gem; });
  g.active = null; g.pieces++; g.chain = 0;
  return resolve(g);
}
export function act(game: Game, action: Action): Game {
  if (game.phase !== "falling" || !game.active) return game;
  const g = { ...game, active: { ...game.active, gems: [...game.active.gems] } };
  if (action === "rotate" || action === "reverse") {
    const gems = g.active.gems;
    g.active.gems = action === "rotate" ? [gems[2], gems[0], gems[1]] : [gems[1], gems[2], gems[0]];
  } else if (action === "drop") {
    g.active = ghost(g)!; g.wait = 0;
    return lock(g);
  } else {
    const p = { ...g.active, x: g.active.x + (action === "left" ? -1 : action === "right" ? 1 : 0), y: g.active.y + (action === "down" ? 1 : 0) };
    if (fits(g, p)) { g.active = p; if (action === "down") g.wait = 0; }
    else if (action === "down") return lock(g);
    else return game;
  }
  return g;
}
/** Only foreground time is passed here. One stage per tick preserves each visual/sound event. */
export function tick(game: Game, milliseconds: number): Game {
  if (game.phase === "over") return game;
  const g = { ...game, wait: game.wait + Math.max(0, Math.min(milliseconds, 100)) };
  if (g.phase === "falling") {
    const s = speed(g);
    if (s && g.wait >= 1000 / s) return act({ ...g, wait: 0 }, "down");
    if (!s) g.wait = 0;
  } else if (g.phase === "clearing" && g.wait >= 320) {
    g.board = [...g.board];
    g.matches.forEach(i => { g.board[i] = null; });
    g.cleared += g.matches.length; g.score += g.matches.length * 10 * g.chain;
    g.matches = []; g.board = gravity(g.board, g.config.width, g.config.height);
    g.phase = "settling"; g.wait = 0;
  } else if (g.phase === "settling" && g.wait >= 220) return resolve(g);
  return g;
}
/** Resize without removing occupied cells. Left and bottom edges are the stable anchors. */
export function reconfigure(game: Game, config: Config): Game {
  if (!validConfig(config)) throw new Error("请检查设置范围，至少保留两种元素");
  const g = { ...game, config: { ...config, kinds: [...config.kinds] }, board: [...game.board], active: game.active && { ...game.active, gems: [...game.active.gems] }, next: [...game.next] };
  if (game.config.width !== config.width || game.config.height !== config.height) {
    if (g.phase === "clearing" || g.phase === "settling") throw new Error("请先关闭设置，让这次连锁完成后再调整尺寸");
    const delta = config.height - game.config.height;
    const board: (number | null)[] = Array(config.width * config.height).fill(null);
    game.board.forEach((gem, i) => {
      if (gem === null) return;
      const x = i % game.config.width, y = Math.floor(i / game.config.width) + delta;
      if (x >= config.width || y < 0) throw new Error("这个尺寸会裁掉已有元素。请扩大尺寸，或选择按新设置重新开局");
      board[y * config.width + x] = gem;
    });
    g.board = board;
    if (g.active) {
      g.active.x = Math.min(g.active.x, config.width - 1);
      g.active.y = Math.max(0, Math.min(config.height - 3, g.active.y + delta));
      if (!fits(g, g.active)) throw new Error("新尺寸放不下当前三连块，请扩大尺寸或重新开局");
    }
  }
  const replace = (v: number) => config.kinds.includes(v) ? v : randomGem(g);
  g.board = g.board.map(v => v === null ? null : replace(v));
  g.next = g.next.map(replace);
  if (g.active) g.active.gems = g.active.gems.map(replace);
  const changedKinds = game.config.kinds.some(v => !config.kinds.includes(v));
  if (changedKinds && g.phase !== "over") {
    // Recompute an uncommitted clear before counting it; replacement never duplicates a reward.
    g.matches = []; g.chain = 0; resolve(g);
  }
  if (config.speed !== game.config.speed) g.wait = 0;
  return g;
}
export function validGame(v: unknown): v is Game {
  if (!v || typeof v !== "object") return false;
  const g = v as Game;
  if (!validConfig(g.config) || !Array.isArray(g.board) || g.board.length !== g.config.width * g.config.height) return false;
  const gem = (v: unknown): v is number => integer(v, 0, 6) && g.config.kinds.includes(v);
  const triple = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every(gem);
  if (!g.board.every(v => v === null || gem(v)) || !triple(g.next)
    || !integer(g.seed, 0, 4294967295) || !["falling", "clearing", "settling", "over"].includes(g.phase)
    || !number(g.wait, 0, 100000) || ![g.score, g.cleared, g.chain, g.bestChain, g.pieces].every(v => integer(v, 0, Number.MAX_SAFE_INTEGER))
    || g.bestChain < g.chain || !Array.isArray(g.matches) || !g.matches.every(v => integer(v, 0, g.board.length - 1))
    || new Set(g.matches).size !== g.matches.length) return false;
  if (g.active !== null && (!g.active || !integer(g.active.x, 0, g.config.width - 1)
    || !integer(g.active.y, 0, g.config.height - 3) || !triple(g.active.gems) || !fits(g, g.active))) return false;
  if ((g.phase === "falling" && !g.active) || (g.phase === "over" && g.active)) return false;
  if (g.phase === "clearing") return g.chain >= 1 && g.matches.length >= 3
    && JSON.stringify(g.matches) === JSON.stringify(findMatches(g.board, g.config.width, g.config.height));
  return g.matches.length === 0;
}
