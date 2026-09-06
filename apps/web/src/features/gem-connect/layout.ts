import type { Point } from "./logic";

export type BoardLayout = { rows: number; cols: number; cell: number; transposed: boolean };
/** Reserve a complete empty perimeter for the outside routes and their glow. */
export function fitBoard(rows: number, cols: number, width: number, height: number): BoardLayout {
  const availableWidth = Math.max(0, width - 8), availableHeight = Math.max(0, height - 8);
  const normal = Math.min(availableWidth / (cols + 2), availableHeight / (rows + 2));
  const turned = Math.min(availableWidth / (rows + 2), availableHeight / (cols + 2));
  const transposed = turned > normal + 0.5;
  return { rows: transposed ? cols : rows, cols: transposed ? rows : cols,
    cell: Math.floor((transposed ? turned : normal) * 100) / 100, transposed };
}
export function displayPoint(point: Point, transposed: boolean): Point {
  return transposed ? { r: point.c, c: point.r } : point;
}
export function displayIndex(index: number, logicalCols: number, layout: BoardLayout) {
  const point = displayPoint({ r: Math.floor(index / logicalCols), c: index % logicalCols }, layout.transposed);
  return point.r * layout.cols + point.c;
}
export function logicalIndex(index: number, logicalCols: number, layout: BoardLayout) {
  const point = displayPoint({ r: Math.floor(index / layout.cols), c: index % layout.cols }, layout.transposed);
  return point.r * logicalCols + point.c;
}
