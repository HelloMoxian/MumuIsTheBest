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
export type PreviewZone = "top" | "middle" | "bottom";
export type Matrix = readonly (readonly number[])[];
export type Piece = { kind: Kind; matrix: Matrix; x: number; y: number };
export type TetrisStatistics = {
  appearances: Record<Kind, number>;
  clearedLines: Record<Kind, number>;
  placements: Record<Kind, number>;
  perfect: Record<Kind, number>;
  lineClears: [number, number, number, number];
};
export type Settings = { initialSpeed: number; speedIncrement: number };
export type Action = "left" | "right" | "down" | "rotate" | "reverse" | "drop";
export type ClearEvent = { id: number; lines: number; points: number };
export type TetrisSound = "move" | "rotate" | "lock" | "clear" | "level";
export type Game = {
  board: Cell[][]; piece: Piece; next: Kind[]; bag: Kind[]; seed: number;
  lines: number; score: number; ended: boolean; elapsed: number;
  pieceId: number; clearing: { board: Cell[][]; rows: number[]; elapsed: number } | null;
  settings: Settings; events: ClearEvent[]; sounds: TetrisSound[]; serial: number;
  statistics: TetrisStatistics;
};
const KINDS = Object.keys(SHAPES) as Kind[];
const emptyKindCounts = () => Object.fromEntries(KINDS.map(kind => [kind, 0])) as Record<Kind, number>;
export function emptyStatistics(): TetrisStatistics {
  return { appearances: emptyKindCounts(), clearedLines: emptyKindCounts(), placements: emptyKindCounts(), perfect: emptyKindCounts(), lineClears: [0, 0, 0, 0] };
}
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
    ended: false, elapsed: 0, pieceId: 0, clearing: null, settings: validateSettings(settings), events: [], sounds: [], serial: 0,
    statistics: emptyStatistics(),
  };
  game.piece = spawn(draw(game));
  game.statistics.appearances[game.piece.kind]++;
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
  return landingFrom(game, game.piece);
}
function landingFrom(game: Game, source: Piece): Piece {
  let piece = { ...source };
  while (fits(game, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  return piece;
}
export function countColumnHoles(board: readonly (readonly Cell[])[]) {
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
export function previewZoneFor(board: readonly (readonly Cell[])[]): PreviewZone {
  const highestOccupiedRow = board.findIndex(row => row.some(Boolean));
  if (highestOccupiedRow < 0 || highestOccupiedRow >= 14) return "bottom";
  if (highestOccupiedRow >= 7) return "middle";
  return "top";
}
export function mouseBaseline(clientX: number, bounds: { left: number; right: number; width: number }) {
  if (!(bounds.width > 0) || clientX <= bounds.left) return 0;
  if (clientX >= bounds.right) return WIDTH - 2;
  const pointedColumn = Math.floor((clientX - bounds.left) / bounds.width * WIDTH);
  return Math.min(WIDTH - 2, Math.max(0, pointedColumn - 1));
}
function boardWithPiece(game: Game, piece: Piece) {
  const board = game.board.map(row => [...row]);
  for (const [x, y] of cells(piece)) board[y][x] = piece.kind;
  return board;
}
function rotations(matrix: Matrix) {
  const result: Matrix[] = [];
  let current = matrix;
  for (let turn = 0; turn < 4; turn++) {
    const signature = JSON.stringify(current);
    if (!result.some(item => JSON.stringify(item) === signature)) result.push(current);
    current = current.map((row, y) => row.map((_, x) => current[current.length - 1 - x][y]));
  }
  return result;
}
export function bestMousePlacement(game: Game, baselineLeft: number): Piece | undefined {
  if (game.ended || game.clearing) return;
  const left = Math.max(0, Math.min(WIDTH - 2, Math.floor(baselineLeft)));
  const existingHoles = countColumnHoles(game.board);
  let best: { piece: Piece; holes: number; depth: number; edge: number; x: number } | undefined;
  for (const matrix of rotations(SHAPES[game.piece.kind])) {
    const local = matrix.flatMap((row, y) => row.flatMap((value, x) => value ? [[x, y] as [number, number]] : []));
    const minX = Math.min(...local.map(([x]) => x));
    const maxX = Math.max(...local.map(([x]) => x));
    for (let x = -minX; x <= WIDTH - 1 - maxX; x++) {
      const globalMin = x + minX;
      const globalMax = x + maxX;
      const aligned = globalMin === globalMax ? globalMin === left || globalMin === left + 1 : globalMin <= left && globalMax >= left + 1;
      if (!aligned) continue;
      const candidate = { kind: game.piece.kind, matrix, x, y: game.piece.y };
      if (!fits(game, candidate)) continue;
      const landed = landingFrom(game, candidate);
      const occupied = cells(landed);
      const score = {
        piece: candidate,
        holes: countColumnHoles(boardWithPiece(game, landed)) - existingHoles,
        depth: Math.max(...occupied.map(([, y]) => y)),
        edge: Math.min(Math.min(...occupied.map(([cellX]) => cellX)), WIDTH - 1 - Math.max(...occupied.map(([cellX]) => cellX))),
        x,
      };
      if (!best || score.holes < best.holes || score.holes === best.holes && (score.depth > best.depth || score.depth === best.depth && (score.edge < best.edge || score.edge === best.edge && score.x < best.x))) best = score;
    }
  }
  return best?.piece;
}
export function directMousePlacement(game: Game, baselineLeft: number): Piece | undefined {
  if (game.ended || game.clearing) return;
  const left = Math.max(0, Math.min(WIDTH - 2, Math.floor(baselineLeft)));
  const local = game.piece.matrix.flatMap((row, y) => row.flatMap((value, x) => value ? [[x, y] as [number, number]] : []));
  const minX = Math.min(...local.map(([x]) => x));
  const maxX = Math.max(...local.map(([x]) => x));
  const minimumPieceX = -minX;
  const maximumPieceX = WIDTH - 1 - maxX;
  const centeredX = Math.round(left + 0.5 - (minX + maxX) / 2);
  const x = left === 0 ? minimumPieceX : left === WIDTH - 2 ? maximumPieceX : Math.max(minimumPieceX, Math.min(maximumPieceX, centeredX));
  const candidate = { ...game.piece, x };
  return fits(game, candidate) ? candidate : undefined;
}
export function mousePlacement(game: Game, baselineLeft: number, bestMatch: boolean) {
  return bestMatch ? bestMousePlacement(game, baselineLeft) : directMousePlacement(game, baselineLeft);
}
function lock(game: Game) {
  const previousLevel = levelFor(game.lines);
  const kind = game.piece.kind;
  const holesBefore = countColumnHoles(game.board);
  for (const [x,y] of cells(game.piece)) game.board[y][x] = game.piece.kind;
  game.statistics.placements[kind]++;
  const remaining = game.board.filter(row => row.some(cell => cell === null));
  const count = HEIGHT - remaining.length;
  if (count) {
    game.statistics.lineClears[count - 1]++;
    game.statistics.clearedLines[kind] += count;
    game.clearing = { board: game.board.map(row => [...row]), rows: game.board.flatMap((row, y) => row.every(Boolean) ? [y] : []), elapsed: 0 };
    const points = [0,100,300,500,800][count] * levelFor(game.lines);
    game.score += points;
    game.lines += count;
    game.events.push({ id: ++game.serial, lines: count, points });
    game.board = [...Array.from({ length: count }, () => Array<Cell>(WIDTH).fill(null)), ...remaining];
  }
  // A cavity that disappears with this placement's line clear is not a mistake.
  if (countColumnHoles(game.board) <= holesBefore) game.statistics.perfect[kind]++;
  game.sounds.push("lock");
  if (count) game.sounds.push("clear");
  if (levelFor(game.lines) > previousLevel) game.sounds.push("level");
  game.pieceId++;
  game.piece = spawn(game.next.shift()!);
  game.statistics.appearances[game.piece.kind]++;
  game.next.push(draw(game));
  game.elapsed = 0;
  game.ended = !fits(game, game.piece);
}
export function act(game: Game, action: Action): boolean {
  if (game.ended || game.clearing) return false;
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
// The fracture wave and board collapse overlap, keeping the whole clear crisp.
export const CLEAR_DURATION = 420;
export function tick(game: Game, milliseconds: number, reducedMotion = false): boolean {
  if (game.clearing) {
    game.clearing.elapsed += Math.max(0, Math.min(milliseconds, 250));
    if (reducedMotion || game.clearing.elapsed >= CLEAR_DURATION) {
      game.clearing = null;
      return true;
    }
    // The visible fracture and collapse run in CSS; React only renders their start and end.
    return false;
  }
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
  KeyA: [0,"left"], KeyD: [0,"right"], KeyS: [0,"down"],
  KeyJ: [0,"rotate"], KeyK: [0,"reverse"], KeyW: [0,"drop"],
  ArrowLeft: [1,"left"], ArrowRight: [1,"right"], ArrowDown: [1,"down"],
  KeyN: [1,"rotate"], KeyM: [1,"reverse"], Enter: [1,"drop"],
};
