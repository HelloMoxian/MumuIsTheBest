export const WIDTH = 10;
export const HEIGHT = 20;
export const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
} as const;
export type Kind = keyof typeof SHAPES;
export type Cell = Kind | null;
export type Matrix = readonly (readonly number[])[];
export type Piece = { kind: Kind; matrix: Matrix; x: number; y: number };
export type Settings = { initialSpeed: number; speedIncrement: number };
export type Action = "left" | "right" | "down" | "rotate" | "reverse" | "drop";
export type ClearEvent = { id: number; lines: number; points: number };
export type TetrisSound = "move" | "rotate" | "lock" | "clear" | "level";
export type Game = {
  board: Cell[][]; piece: Piece; next: Kind[]; bag: Kind[]; seed: number;
  lines: number; score: number; ended: boolean; elapsed: number;
  settings: Settings; events: ClearEvent[]; sounds: TetrisSound[]; serial: number;
};
export function validateSettings(settings: Settings): Settings {
  for (const value of [settings.initialSpeed, settings.speedIncrement]) {
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("速度请输入 0 到 100 的整数");
  }
  return { ...settings };
}
export function levelFor(lines: number) { return 1 + Math.floor(lines / 20); }
export function speedFor(settings: Settings, lines: number) {
  return Math.min(100, settings.initialSpeed + Math.floor(lines / 20) * settings.speedIncrement);
}
export function intervalFor(speed: number) { return speed === 0 ? Infinity : 5000 / speed; }
function random(game: Game) {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
}
function draw(game: Game): Kind {
  if (!game.bag.length) {
    game.bag = Object.keys(SHAPES) as Kind[];
    for (let i = game.bag.length - 1; i > 0; i--) {
      const j = Math.floor(random(game) * (i + 1));
      [game.bag[i], game.bag[j]] = [game.bag[j], game.bag[i]];
    }
  }
  return game.bag.pop()!;
}
function spawn(kind: Kind): Piece {
  return { kind, matrix: SHAPES[kind], x: Math.floor((WIDTH - SHAPES[kind].length) / 2), y: 0 };
}
export function createGame(settings: Settings, seed = Date.now()): Game {
  const game: Game = {
    board: Array.from({ length: HEIGHT }, () => Array<Cell>(WIDTH).fill(null)),
    piece: spawn("T"), next: [], bag: [], seed: seed >>> 0, lines: 0, score: 0,
    ended: false, elapsed: 0, settings: validateSettings(settings), events: [], sounds: [], serial: 0,
  };
  game.piece = spawn(draw(game));
  game.next = Array.from({ length: 3 }, () => draw(game));
  return game;
}
export function cells(piece: Piece): [number, number][] {
  return piece.matrix.flatMap((row, y) => row.flatMap((value, x) => value ? [[x + piece.x, y + piece.y] as [number, number]] : []));
}
export function fits(game: Game, piece: Piece) {
  return cells(piece).every(([x,y]) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && !game.board[y][x]);
}
export function landing(game: Game): Piece {
  let piece = { ...game.piece };
  while (fits(game, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  return piece;
}
function lock(game: Game) {
  const previousLevel = levelFor(game.lines);
  for (const [x,y] of cells(game.piece)) game.board[y][x] = game.piece.kind;
  const remaining = game.board.filter(row => row.some(cell => cell === null));
  const count = HEIGHT - remaining.length;
  if (count) {
    const points = [0,100,300,500,800][count] * levelFor(game.lines);
    game.score += points;
    game.lines += count;
    game.events.push({ id: ++game.serial, lines: count, points });
    game.board = [...Array.from({ length: count }, () => Array<Cell>(WIDTH).fill(null)), ...remaining];
  }
  game.sounds.push(levelFor(game.lines) > previousLevel ? "level" : count ? "clear" : "lock");
  game.piece = spawn(game.next.shift()!);
  game.next.push(draw(game));
  game.elapsed = 0;
  game.ended = !fits(game, game.piece);
}
export function act(game: Game, action: Action): boolean {
  if (game.ended) return false;
  if (action === "drop") {
    const target = landing(game);
    game.score += (target.y - game.piece.y) * 2;
    game.piece = target;
    lock(game);
    return true;
  }
  if (action === "rotate" || action === "reverse") {
    if (game.piece.kind === "O") return false;
    const matrix = game.piece.matrix;
    const rotated = matrix.map((row, y) => row.map((_, x) => action === "rotate" ? matrix[matrix.length - 1 - x][y] : matrix[x][matrix.length - 1 - y]));
    // Small wall/floor offsets keep rotation usable beside walls without tunnelling.
    for (const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[0,-2]]) {
      const target = { ...game.piece, matrix: rotated, x: game.piece.x + dx, y: game.piece.y + dy };
      if (fits(game,target)) { game.piece = target; game.sounds.push("rotate"); return true; }
    }
    return false;
  }
  const target = { ...game.piece, x: game.piece.x + (action === "left" ? -1 : action === "right" ? 1 : 0), y: game.piece.y + (action === "down" ? 1 : 0) };
  if (fits(game,target)) {
    game.piece = target;
    game.sounds.push("move");
    if (action === "down") { game.score++; game.elapsed = 0; }
    return true;
  }
  if (action === "down") { lock(game); return true; }
  return false;
}
export function tick(game: Game, milliseconds: number): boolean {
  if (game.ended || speedFor(game.settings,game.lines) === 0) return false;
  game.elapsed += Math.max(0, Math.min(milliseconds, 250));
  let changed = false;
  while (game.elapsed >= intervalFor(speedFor(game.settings,game.lines))) {
    game.elapsed -= intervalFor(speedFor(game.settings,game.lines));
    const target = { ...game.piece, y: game.piece.y + 1 };
    if (fits(game,target)) game.piece = target;
    else { lock(game); return true; }
    changed = true;
  }
  return changed;
}
export const KEY_BINDINGS: Readonly<Record<string, readonly [number, Action]>> = {
  ArrowLeft: [0,"left"], ArrowRight: [0,"right"], ArrowDown: [0,"down"],
  KeyN: [0,"rotate"], KeyM: [0,"reverse"], Enter: [0,"drop"], NumpadEnter: [0,"drop"],
  KeyA: [1,"left"], KeyD: [1,"right"], KeyS: [1,"down"],
  KeyK: [1,"rotate"], KeyJ: [1,"reverse"], KeyE: [1,"drop"],
};
