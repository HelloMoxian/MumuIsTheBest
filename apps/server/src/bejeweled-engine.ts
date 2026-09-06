export const BOARD_COLUMNS = 12;
export const BOARD_ROWS = 10;
export const BOARD_SIZE = BOARD_COLUMNS * BOARD_ROWS;
export const COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "white"] as const;
export type Color = typeof COLORS[number];
export type Special = "normal" | "flame" | "star" | "cube" | "nova";
export type Gem = { id: number; color: Color; special: Special };
export type Board = (Gem | null)[];
export type Mode = "endless" | "classic";
export type Counts = Record<Color, number>;
export type Game = {
  columns: number; rows: number;
  board: Board;
  seed: number;
  nextId: number;
  mode: Mode;
  status: "playing" | "finished";
  score: number;
  cleared: number;
  moves: number;
  level: number;
};
export type Blast = { source: number; kind: Exclude<Special, "normal">; targets: number[] };
export type Frame = {
  board: Board; cleared: number[]; created: number[]; points: number; cascade: number;
  phase: "swap" | "clear" | "vacate" | "fall";
  groups?: number[][]; blasts?: Blast[];
};
export type MoveResult = {
  game: Game; frames: Frame[]; counts: Counts; points: number; cleared: number;
  shuffled: boolean; longestCascade: number;
};

export function emptyCounts(): Counts {
  return { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0, white: 0 };
}
function random(game: Game) {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
}
function gem(game: Game): Gem {
  return { id: game.nextId++, color: COLORS[Math.floor(random(game) * 7)], special: "normal" };
}
export function adjacent(a: number, b: number, columns = BOARD_COLUMNS, rows = BOARD_ROWS) {
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a < columns * rows && b >= 0 && b < columns * rows
    && Math.abs(a % columns - b % columns) + Math.abs(Math.floor(a / columns) - Math.floor(b / columns)) === 1;
}
type Run = { cells: number[]; horizontal: boolean };
export function findRuns(board: Board, columns = BOARD_COLUMNS, rows = BOARD_ROWS): Run[] {
  const runs: Run[] = [];
  for (const horizontal of [true, false]) {
    for (let line = 0; line < (horizontal ? rows : columns); line++) {
      let cells: number[] = [];
      for (let pos = 0; pos <= (horizontal ? columns : rows); pos++) {
        const index = horizontal ? line * columns + pos : pos * columns + line;
        const current = pos < (horizontal ? columns : rows) ? board[index] : null;
        const first = board[cells[0]];
        if (current && current.special !== "cube" && first?.color === current.color) {
          cells.push(index);
        } else {
          if (cells.length >= 3) runs.push({ cells, horizontal });
          cells = current && current.special !== "cube" ? [index] : [];
        }
      }
    }
  }
  return runs;
}
export function canSwap(board: Board, a: number, b: number, columns = BOARD_COLUMNS, rows = BOARD_ROWS): boolean {
  if (!adjacent(a, b, columns, rows) || !board[a] || !board[b]) return false;
  if (board[a]?.special === "cube" || board[b]?.special === "cube") return true;
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return findRuns(next, columns, rows).some(run => run.cells.includes(a) || run.cells.includes(b));
}
export function findMove(board: Board, columns = BOARD_COLUMNS, rows = BOARD_ROWS): [number, number] | null {
  for (let a = 0; a < columns * rows; a++) {
    for (const b of [a + 1, a + columns]) if (canSwap(board, a, b, columns, rows)) return [a, b];
  }
  return null;
}
function freshBoard(game: Game) {
  const { columns, rows } = game;
  game.board = [];
  for (let index = 0; index < columns * rows; index++) {
    let next = gem(game);
    while ((index % columns >= 2 && game.board[index - 1]?.color === next.color && game.board[index - 2]?.color === next.color)
      || (index >= 2 * columns && game.board[index - columns]?.color === next.color && game.board[index - 2 * columns]?.color === next.color)) {
      next = gem(game);
    }
    game.board.push(next);
  }
}
export function createGame(seed: number, mode: Mode = "endless", columns = BOARD_COLUMNS, rows = BOARD_ROWS): Game {
  const game: Game = { columns, rows, board: [], seed: seed >>> 0, nextId: 1, mode, status: "playing", score: 0, cleared: 0, moves: 0, level: 1 };
  do { freshBoard(game); } while (!findMove(game.board, game.columns, game.rows));
  return game;
}
function shuffle(game: Game) {
  const original = [...game.board];
  for (let attempt = 0; attempt < 2048; attempt++) {
    game.board = [...original];
    for (let i = game.board.length - 1; i > 0; i--) {
      const j = Math.floor(random(game) * (i + 1));
      [game.board[i], game.board[j]] = [game.board[j], game.board[i]];
    }
    if (!findRuns(game.board, game.columns, game.rows).length && findMove(game.board, game.columns, game.rows)) return;
  }
  // Preserve every gem if an exceptionally constrained board cannot be rearranged.
  game.board = original;
  const index = game.board.findIndex(value => value?.special === "normal");
  const target = game.board[index < 0 ? 0 : index];
  if (target) target.special = "cube";
}
function groupRuns(runs: Run[]) {
  const groups: Run[][] = [];
  for (const run of runs) {
    const touching = groups.filter(group => group.some(other => other.cells.some(i => run.cells.includes(i))));
    const merged = [run, ...touching.flat()];
    for (const group of touching) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups;
}
function specialsFor(runs: Run[], board: Board, preferred: number[]) {
  const creations = new Map<number, Special>();
  const groups = groupRuns(runs);
  for (const group of groups) {
    const longest = Math.max(...group.map(run => run.cells.length));
    const crossing = group.some(run => group.some(other => run.horizontal !== other.horizontal && run.cells.some(i => other.cells.includes(i))));
    const kind: Special = longest >= 6 ? "nova" : longest >= 5 ? "cube" : crossing ? "star" : longest === 4 ? "flame" : "normal";
    if (kind === "normal") continue;
    const cells = [...new Set(group.flatMap(run => run.cells))];
    const crossCell = cells.find(i => group.filter(run => run.cells.includes(i)).length > 1);
    const location = preferred.find(i => cells.includes(i) && board[i]?.special === "normal")
      ?? (crossCell !== undefined && board[crossCell]?.special === "normal" ? crossCell : undefined)
      ?? cells.find(i => board[i]?.special === "normal");
    if (location !== undefined) creations.set(location, kind);
  }
  return creations;
}
export function playMove(input: Game, a: number, b: number): MoveResult | null {
  if (input.status !== "playing" || !canSwap(input.board, a, b, input.columns, input.rows)) return null;
  const game = structuredClone(input);
  const { columns, rows } = game;
  [game.board[a], game.board[b]] = [game.board[b], game.board[a]];
  const frames: Frame[] = [{ board: structuredClone(game.board), cleared: [], created: [], points: 0, cascade: 0, phase: "swap" }];
  const counts = emptyCounts();
  let points = 0;
  let totalCleared = 0;
  let cascade = 0;
  let initial = new Set<number>();
  const left = game.board[a]!;
  const right = game.board[b]!;
  if (left.special === "cube" || right.special === "cube") {
    if (left.special === "cube" && right.special === "cube") {
      initial = new Set(Array.from({ length: columns * rows }, (_, i) => i));
    } else {
      const color = left.special === "cube" ? right.color : left.color;
      initial.add(left.special === "cube" ? a : b);
      game.board.forEach((value, i) => { if (value?.color === color) initial.add(i); });
    }
  }
  while (true) {
    const runs = findRuns(game.board, game.columns, game.rows);
    if (!runs.length && !initial.size) break;
    if (++cascade > 128) throw new Error("Cascade limit reached");
    const creations = initial.size ? new Map<number, Special>() : specialsFor(runs, game.board, cascade === 1 ? [b, a] : []);
    const remove = new Set([...initial, ...runs.flatMap(run => run.cells)]);
    const queued = [...remove];
    const visited = new Set<number>();
    const blasts: Blast[] = [];
    const cubeTriggers = new Map<number, Color>();
    const add = (i: number) => {
      if (i < 0 || i >= columns * rows || !game.board[i]) return;
      if (!remove.has(i)) { remove.add(i); queued.push(i); }
    };
    for (let q = 0; q < queued.length; q++) {
      const index = queued[q];
      if (visited.has(index)) continue;
      visited.add(index);
      const value = game.board[index];
      if (!value || value.special === "normal") continue;
      const row = Math.floor(index / columns);
      const col = index % columns;
      if (value.special === "cube") {
        // A cube struck by a blast clears the color of the triggering gem.
        const color = initial.has(index) ? null : cubeTriggers.get(index) ?? value.color;
        const targets = color ? game.board.flatMap((other, i) => other?.color === color ? [i] : []) : [...initial];
        blasts.push({ source: index, kind: "cube", targets });
        if (color) game.board.forEach((other, i) => { if (other?.color === color) add(i); });
      } else {
        const targets: number[] = [];
        for (let i = 0; i < columns * rows; i++) {
          const r = Math.floor(i / columns);
          const c = i % columns;
          const hit = value.special === "flame" ? Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1
            : value.special === "nova" ? Math.abs(r - row) <= 1 || Math.abs(c - col) <= 1
            : r === row || c === col;
          if (hit) {
            targets.push(i);
            const other = game.board[i];
            if (other?.special === "cube") {
              cubeTriggers.set(i, value.color);
              game.board.forEach((target, j) => { if (target?.color === value.color) add(j); });
            }
            add(i);
          }
        }
        blasts.push({ source: index, kind: value.special, targets });
      }
    }
    // Creation consumes its component gem, but keeps the new special at that slot.
    let roundPoints = 0;
    for (const index of remove) {
      const value = game.board[index];
      if (!value) continue;
      if (!creations.has(index)) {
        counts[value.color]++;
        totalCleared++;
      }
    }
    const roundCleared = [...remove].filter(i => !creations.has(i));
    roundPoints = roundCleared.length * 50 * input.level * cascade;
    for (const special of creations.values()) roundPoints += ({ flame: 100, star: 150, cube: 500, nova: 1000, normal: 0 }[special]) * input.level;
    points += roundPoints;
    frames.push({ board: structuredClone(game.board), cleared: roundCleared, created: [...creations.keys()], points: roundPoints, cascade,
      phase: "clear", groups: groupRuns(runs).map(group => [...new Set(group.flatMap(run => run.cells))]), blasts });
    for (const index of remove) {
      const value = game.board[index]!;
      const special = creations.get(index);
      game.board[index] = special ? { ...value, special } : null;
    }
    frames.push({ board: structuredClone(game.board), cleared: [], created: [...creations.keys()], points: 0, cascade, phase: "vacate" });
    for (let col = 0; col < columns; col++) {
      const survivors = game.board.filter((value, i) => i % columns === col && value !== null) as Gem[];
      for (let row = rows - 1; row >= 0; row--) game.board[row * columns + col] = survivors.pop() ?? gem(game);
    }
    frames.push({ board: structuredClone(game.board), cleared: [], created: [], points: 0, cascade, phase: "fall" });
    initial = new Set();
  }
  game.score += points;
  game.cleared += totalCleared;
  game.moves++;
  game.level = 1 + Math.floor(game.cleared / 100);
  let shuffled = false;
  if (!findMove(game.board, game.columns, game.rows)) {
    if (game.mode === "classic") game.status = "finished";
    else { shuffle(game); shuffled = true; }
  }
  return { game, frames, counts, points, cleared: totalCleared, shuffled, longestCascade: cascade };
}

/** Keep the old 8 × 8 gems in place and extend right/down without awarding a move. */
export function expandLegacyGame(old: Omit<Game, "columns" | "rows">): Game {
  const game: Game = { ...structuredClone(old), columns: BOARD_COLUMNS, rows: BOARD_ROWS, board: [], status: "playing" };
  for (let row = 0; row < BOARD_ROWS; row++) for (let col = 0; col < BOARD_COLUMNS; col++) {
    const index = row * BOARD_COLUMNS + col;
    if (row < 8 && col < 8) { game.board.push(structuredClone(old.board[row * 8 + col])); continue; }
    let next = gem(game);
    const same = (i: number) => game.board[i]?.special !== "cube" && game.board[i]?.color === next.color;
    while ((col >= 2 && same(index - 1) && same(index - 2))
      || (row >= 2 && same(index - BOARD_COLUMNS) && same(index - BOARD_COLUMNS * 2))) next = gem(game);
    game.board.push(next);
  }
  if (!findMove(game.board)) game.board[BOARD_SIZE - 1]!.special = "cube";
  return game;
}
