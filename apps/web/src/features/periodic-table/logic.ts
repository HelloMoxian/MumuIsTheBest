import { ELEMENTS } from "./elements.generated";

export type Direction = "up" | "down" | "left" | "right";
export type PeriodicElement = (typeof ELEMENTS)[number];

const DIRECTION_BY_WORD: Readonly<Record<string, Direction>> = {
  上: "up",
  下: "down",
  左: "left",
  右: "right",
};

export function parseNavigationCommands(text: string): Direction[] {
  return [...text]
    .map((character) => DIRECTION_BY_WORD[character])
    .filter((direction): direction is Direction => direction !== undefined);
}

export function isDetailCommand(text: string) {
  return /详细信息|查看详情|元素详情|打开详情/.test(text);
}

export function isBackCommand(text: string) {
  return /返回|回去|关闭详情|关掉详情/.test(text);
}

export function findElement(atomicNumber: number) {
  return ELEMENTS.find((element) => element.atomicNumber === atomicNumber) ?? ELEMENTS[0];
}

export function moveSelection(
  currentAtomicNumber: number,
  direction: Direction,
  elements: readonly PeriodicElement[] = ELEMENTS,
) {
  const current = elements.find((element) => element.atomicNumber === currentAtomicNumber);
  if (!current) return elements[0]?.atomicNumber ?? currentAtomicNumber;

  const candidates = elements.filter((element) => {
    if (direction === "left") {
      return element.displayRow === current.displayRow
        && element.displayColumn < current.displayColumn;
    }
    if (direction === "right") {
      return element.displayRow === current.displayRow
        && element.displayColumn > current.displayColumn;
    }
    if (direction === "up") return element.displayRow < current.displayRow;
    return element.displayRow > current.displayRow;
  });

  if (candidates.length === 0) return current.atomicNumber;

  const scored = candidates.map((element) => {
    const rowDistance = Math.abs(element.displayRow - current.displayRow);
    const columnDistance = Math.abs(element.displayColumn - current.displayColumn);
    const score = direction === "left" || direction === "right"
      ? columnDistance
      : rowDistance * 100 + columnDistance;
    return { element, score };
  });

  scored.sort((a, b) => (
    a.score - b.score
    || a.element.atomicNumber - b.element.atomicNumber
  ));
  return scored[0]?.element.atomicNumber ?? current.atomicNumber;
}

export function applyNavigationCommands(
  currentAtomicNumber: number,
  directions: readonly Direction[],
  elements: readonly PeriodicElement[] = ELEMENTS,
) {
  return directions.reduce(
    (atomicNumber, direction) => moveSelection(atomicNumber, direction, elements),
    currentAtomicNumber,
  );
}
