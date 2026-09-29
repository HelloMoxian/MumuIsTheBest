export const WIDTH = 20;
export const HEIGHT = 20;

export type Action = "left" | "right" | "down" | "rotate" | "reverse" | "drop";
export type Settings = { initialSpeed: number; speedIncrement: number };
export type Matrix = readonly (readonly number[])[];
export type Shape = { id: string; size: number; matrix: Matrix };
export type Cell = string | null;
export type Piece = { kind: string; matrix: Matrix; x: number; y: number };
export type ClearEvent = { id: number; lines: number; points: number };
export type SuperBlockSound = "move" | "rotate" | "lock" | "clear" | "level";
export type Game = {
  board: Cell[][]; piece: Piece; next: string[]; seed: number;
  lines: number; score: number; ended: boolean; elapsed: number; pieceId: number;
  clearing: { board: Cell[][]; rows: number[]; elapsed: number } | null;
  fastDrop: { targetY: number; elapsed: number } | null;
  settings: Settings; events: ClearEvent[]; sounds: SuperBlockSound[]; serial: number;
  cellsSpawned: number; appearances: Record<string, number>;
};

type Point = readonly [number, number];
const around = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const pointKey = ([x, y]: Point) => `${x},${y}`;
function normalize(points: readonly Point[]) {
  const minX = Math.min(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  return points.map(([x, y]) => [x - minX, y - minY] as Point).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
function rotate(points: readonly Point[]) { return normalize(points.map(([x, y]) => [-y, x] as Point)); }
function canonical(points: readonly Point[]) {
  const variants: string[] = [];
  let current = normalize(points);
  for (let turn = 0; turn < 4; turn++) {
    variants.push(current.map(pointKey).join(";"));
    current = rotate(current);
  }
  return variants.sort()[0];
}
function pointsFromKey(key: string): Point[] {
  return key.split(";").map(value => value.split(",").map(Number) as [number, number]);
}
function createShapes(): Shape[] {
  let generation = new Map([["0,0", [[0, 0] as Point]]]);
  const shapes: Shape[] = [];
  for (let size = 1; size <= 5; size++) {
    const ordered = [...generation.keys()].sort();
    ordered.forEach((key, index) => {
      const points = pointsFromKey(key);
      const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
      points.forEach(([x, y]) => { matrix[y][x] = 1; });
      shapes.push({ id: `P${size}-${String(index + 1).padStart(2, "0")}`, size, matrix });
    });
    if (size === 5) break;
    const next = new Map<string, Point[]>();
    for (const points of generation.values()) {
      const occupied = new Set(points.map(pointKey));
      for (const [x, y] of points) for (const [dx, dy] of around) {
        const candidate = [x + dx, y + dy] as Point;
        if (occupied.has(pointKey(candidate))) continue;
        const expanded = [...points, candidate];
        next.set(canonical(expanded), pointsFromKey(canonical(expanded)));
      }
    }
    generation = next;
  }
  return shapes;
}

export const SHAPES = createShapes();
export const SHAPE_BY_ID = new Map(SHAPES.map(shape => [shape.id, shape]));
export const SHAPE_COUNTS = Object.freeze(Object.fromEntries([1, 2, 3, 4, 5].map(size => [size, SHAPES.filter(shape => shape.size === size).length])));
const DRAW_POOL = SHAPES.flatMap(shape => Array.from({ length: shape.size === 5 ? 1 : 3 }, () => shape.id));

export function validateSettings(settings: Settings): Settings {
  for (const value of [settings.initialSpeed, settings.speedIncrement]) {
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("速度请输入 0 到 100 的整数");
  }
  return { ...settings };
}
export function levelFor(lines: number) { return 1 + Math.floor(lines / 20); }
export function speedFor(settings: Settings, lines: number) { return Math.min(100, settings.initialSpeed + Math.floor(lines / 20) * settings.speedIncrement); }
export function intervalFor(speed: number) { return speed === 0 ? Infinity : 5000 / speed; }
function random(game: Game) {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
}
function draw(game: Game, enabledKinds: Iterable<string> = SHAPE_BY_ID.keys()) {
  const enabled = new Set(enabledKinds);
  const pool = DRAW_POOL.filter(kind => enabled.has(kind));
  const available = pool.length ? pool : DRAW_POOL;
  return available[Math.floor(random(game) * available.length)];
}
function spawn(kind: string): Piece {
  const matrix = SHAPE_BY_ID.get(kind)!.matrix;
  return { kind, matrix, x: Math.floor((WIDTH - matrix.length) / 2), y: 0 };
}
function recordAppearance(game: Game, kind: string) {
  game.pieceId++;
  game.appearances[kind] = (game.appearances[kind] ?? 0) + 1;
  game.cellsSpawned += SHAPE_BY_ID.get(kind)!.size;
}
export function createGame(settings: Settings, seed = Date.now(), enabledKinds: Iterable<string> = SHAPE_BY_ID.keys()): Game {
  const game: Game = {
    board: Array.from({ length: HEIGHT }, () => Array<Cell>(WIDTH).fill(null)),
    piece: spawn(SHAPES[0].id), next: [], seed: seed >>> 0, lines: 0, score: 0,
    ended: false, elapsed: 0, pieceId: 0, clearing: null, fastDrop: null, settings: validateSettings(settings),
    events: [], sounds: [], serial: 0, cellsSpawned: 0, appearances: {},
  };
  const first = draw(game, enabledKinds);
  game.piece = spawn(first);
  recordAppearance(game, first);
  game.next = Array.from({ length: 3 }, () => draw(game, enabledKinds));
  return game;
}
export function cells(piece: Piece): [number, number][] {
  return piece.matrix.flatMap((row, y) => row.flatMap((value, x) => value ? [[x + piece.x, y + piece.y] as [number, number]] : []));
}
export function fits(game: Game, piece: Piece) {
  return cells(piece).every(([x, y]) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && !game.board[y][x]);
}
export function landing(game: Game): Piece {
  return landingFrom(game, game.piece);
}
function landingFrom(game: Game, source: Piece): Piece {
  let piece = { ...source };
  while (fits(game, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  return piece;
}
function lock(game: Game, enabledKinds: Iterable<string>) {
  game.fastDrop = null;
  const previousLevel = levelFor(game.lines);
  for (const [x, y] of cells(game.piece)) game.board[y][x] = game.piece.kind;
  const rows = game.board.flatMap((row, y) => row.every(Boolean) ? [y] : []);
  const remaining = game.board.filter(row => row.some(cell => cell === null));
  const count = rows.length;
  if (count) {
    game.clearing = { board: game.board.map(row => [...row]), rows, elapsed: 0 };
    const points = [0, 100, 300, 500, 800, 1200][count] * levelFor(game.lines);
    game.score += points;
    game.lines += count;
    game.events.push({ id: ++game.serial, lines: count, points });
    game.board = [...Array.from({ length: count }, () => Array<Cell>(WIDTH).fill(null)), ...remaining];
  }
  game.sounds.push("lock");
  if (count) game.sounds.push("clear");
  if (levelFor(game.lines) > previousLevel) game.sounds.push("level");
  const next = game.next.shift()!;
  game.piece = spawn(next);
  recordAppearance(game, next);
  game.next.push(draw(game, enabledKinds));
  game.elapsed = 0;
  game.ended = !fits(game, game.piece);
}
function rotated(matrix: Matrix, clockwise: boolean): Matrix {
  return matrix.map((row, y) => row.map((_, x) => clockwise ? matrix[matrix.length - 1 - x][y] : matrix[x][matrix.length - 1 - y]));
}
export function act(game: Game, action: Action): boolean {
  return actWithKinds(game, action, SHAPE_BY_ID.keys());
}
export function actWithKinds(game: Game, action: Action, enabledKinds: Iterable<string>): boolean {
  if (game.ended || game.clearing || game.fastDrop) return false;
  if (action === "drop") {
    const target = landing(game);
    game.score += (target.y - game.piece.y) * 2;
    if (target.y === game.piece.y) lock(game, enabledKinds);
    else { game.fastDrop = { targetY: target.y, elapsed: 0 }; game.elapsed = 0; }
    return true;
  }
  if (action === "rotate" || action === "reverse") {
    const matrix = rotated(game.piece.matrix, action === "rotate");
    if (matrix.flat().every((value, index) => value === game.piece.matrix.flat()[index])) return false;
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, -2]]) {
      const target = { ...game.piece, matrix, x: game.piece.x + dx, y: game.piece.y + dy };
      if (fits(game, target)) { game.piece = target; game.sounds.push("rotate"); return true; }
    }
    return false;
  }
  const target = { ...game.piece, x: game.piece.x + (action === "left" ? -1 : action === "right" ? 1 : 0), y: game.piece.y + (action === "down" ? 1 : 0) };
  if (fits(game, target)) {
    game.piece = target; game.sounds.push("move");
    if (action === "down") { game.score++; game.elapsed = 0; }
    return true;
  }
  if (action === "down") { lock(game, enabledKinds); return true; }
  return false;
}

function normalizedMatrix(matrix: Matrix): Matrix {
  const occupied = matrix.flatMap((row, y) => row.flatMap((value, x) => value ? [[x, y] as Point] : []));
  const minX = Math.min(...occupied.map(([x]) => x));
  const minY = Math.min(...occupied.map(([, y]) => y));
  const size = matrix.length;
  const result = Array.from({ length: size }, () => Array<number>(size).fill(0));
  occupied.forEach(([x, y]) => { result[y - minY][x - minX] = 1; });
  return result;
}
function rotations(matrix: Matrix): Matrix[] {
  const result: Matrix[] = [];
  const seen = new Set<string>();
  let current = normalizedMatrix(matrix);
  for (let turn = 0; turn < 4; turn++) {
    const signature = current.map(row => row.join("")).join("/");
    if (!seen.has(signature)) { seen.add(signature); result.push(current); }
    current = normalizedMatrix(rotated(current, true));
  }
  return result;
}
function holeCount(board: Cell[][]) {
  let holes = 0;
  for (let x = 0; x < WIDTH; x++) {
    let covered = false;
    for (let y = 0; y < HEIGHT; y++) {
      if (board[y][x]) covered = true;
      else if (covered) holes++;
    }
  }
  return holes;
}
function boardWithPiece(game: Game, piece: Piece) {
  const board = game.board.map(row => [...row]);
  cells(piece).forEach(([x, y]) => { board[y][x] = piece.kind; });
  return board;
}
export function bestMousePlacement(game: Game, baselineLeft: number): Piece | undefined {
  if (game.ended || game.clearing) return;
  const left = Math.max(0, Math.min(WIDTH - 2, Math.floor(baselineLeft)));
  const existingHoles = holeCount(game.board);
  let best: { piece: Piece; holes: number; depth: number; edge: number; x: number } | undefined;
  for (const matrix of rotations(SHAPE_BY_ID.get(game.piece.kind)!.matrix)) {
    const localCells = matrix.flatMap((row, y) => row.flatMap((value, x) => value ? [[x, y] as Point] : []));
    const minX = Math.min(...localCells.map(([x]) => x));
    const maxX = Math.max(...localCells.map(([x]) => x));
    for (let x = -minX; x <= WIDTH - 1 - maxX; x++) {
      const globalMin = x + minX; const globalMax = x + maxX;
      const aligned = globalMin === globalMax ? globalMin === left || globalMin === left + 1 : globalMin <= left && globalMax >= left + 1;
      if (!aligned) continue;
      const candidate = { kind: game.piece.kind, matrix, x, y: game.piece.y };
      if (!fits(game, candidate)) continue;
      const landed = landingFrom(game, candidate);
      const occupied = cells(landed);
      const score = {
        piece: candidate,
        holes: holeCount(boardWithPiece(game, landed)) - existingHoles,
        depth: Math.max(...occupied.map(([, y]) => y)),
        edge: Math.min(Math.min(...occupied.map(([cellX]) => cellX)), WIDTH - 1 - Math.max(...occupied.map(([cellX]) => cellX))),
        x,
      };
      if (!best || score.holes < best.holes || score.holes === best.holes && (score.depth > best.depth || score.depth === best.depth && (score.edge < best.edge || score.edge === best.edge && score.x < best.x))) best = score;
    }
  }
  return best?.piece;
}
export const CLEAR_DURATION = 420;
export function tick(game: Game, milliseconds: number, reducedMotion = false, enabledKinds: Iterable<string> = SHAPE_BY_ID.keys()): boolean {
  if (game.clearing) {
    game.clearing.elapsed += Math.max(0, Math.min(milliseconds, 250));
    if (reducedMotion || game.clearing.elapsed >= CLEAR_DURATION) game.clearing = null;
    return true;
  }
  if (game.fastDrop) {
    game.fastDrop.elapsed += Math.max(0, Math.min(milliseconds, 250));
    const steps = reducedMotion ? HEIGHT : Math.floor(game.fastDrop.elapsed / 4);
    if (!steps) return false;
    game.fastDrop.elapsed -= steps * 4;
    game.piece = { ...game.piece, y: Math.min(game.fastDrop.targetY, game.piece.y + steps) };
    if (game.piece.y >= game.fastDrop.targetY) lock(game, enabledKinds);
    return true;
  }
  const speed = speedFor(game.settings, game.lines);
  if (game.ended || speed === 0) return false;
  game.elapsed += Math.max(0, Math.min(milliseconds, 250));
  let changed = false;
  while (game.elapsed >= intervalFor(speedFor(game.settings, game.lines))) {
    game.elapsed -= intervalFor(speedFor(game.settings, game.lines));
    const target = { ...game.piece, y: game.piece.y + 1 };
    if (fits(game, target)) game.piece = target;
    else { lock(game, enabledKinds); return true; }
    changed = true;
  }
  return changed;
}

export const KEY_BINDINGS: Readonly<Record<string, readonly [number, Action]>> = {
  KeyA: [0, "left"], KeyD: [0, "right"], KeyS: [0, "down"],
  KeyJ: [0, "rotate"], KeyK: [0, "reverse"], KeyW: [0, "drop"],
};
