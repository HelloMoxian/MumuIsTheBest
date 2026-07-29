export type AtomCounts = Readonly<Record<string, number>>;

export type CompoundKind =
  | "molecule"
  | "formula-unit"
  | "allotrope"
  | "hydrate"
  | "intermetallic";

export type ReactionCompound = {
  id: string;
  formula: string;
  name: string;
  feature: string;
  kind: CompoundKind;
  atomCounts: AtomCounts;
  totalAtoms: number;
};

export type AtomBundle = {
  id: string;
  symbol: string;
  count: number;
};

const SUBSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

export function normalizeFormula(formula: string) {
  return [...formula]
    .map((character) => SUBSCRIPT_DIGITS[character] ?? character)
    .join("")
    .replace(/\s+/g, "")
    .replace(/[⁺⁻]+$/u, "")
    .replace(/[+-]\d*$/, "");
}

function readNumber(source: string, start: number) {
  let index = start;
  while (/\d/.test(source[index] ?? "")) index += 1;
  if (index === start) return { value: 1, next: start };
  return { value: Number(source.slice(start, index)), next: index };
}

function mergeCounts(target: Record<string, number>, source: AtomCounts, multiplier = 1) {
  for (const [symbol, count] of Object.entries(source)) {
    target[symbol] = (target[symbol] ?? 0) + count * multiplier;
  }
}

function parseGroup(
  source: string,
  start: number,
  closing: ")" | "]" | null,
): { counts: Record<string, number>; next: number } | null {
  const counts: Record<string, number> = {};
  let index = start;

  while (index < source.length) {
    const character = source[index]!;
    if (closing && character === closing) {
      return { counts, next: index + 1 };
    }
    if (character === "(" || character === "[") {
      const nested = parseGroup(source, index + 1, character === "(" ? ")" : "]");
      if (!nested) return null;
      const multiplier = readNumber(source, nested.next);
      mergeCounts(counts, nested.counts, multiplier.value);
      index = multiplier.next;
      continue;
    }
    if (!/[A-Z]/.test(character)) return null;

    let symbol = character;
    index += 1;
    if (/[a-z]/.test(source[index] ?? "")) {
      symbol += source[index];
      index += 1;
    }
    const multiplier = readNumber(source, index);
    counts[symbol] = (counts[symbol] ?? 0) + multiplier.value;
    index = multiplier.next;
  }

  return closing ? null : { counts, next: index };
}

export function parseFormula(formula: string): Record<string, number> | null {
  const normalized = normalizeFormula(formula);
  if (!normalized || /[nₙ]/u.test(normalized)) return null;

  const total: Record<string, number> = {};
  for (const rawSegment of normalized.split(/[·.]/u)) {
    if (!rawSegment) return null;
    const coefficient = readNumber(rawSegment, 0);
    const segmentSource = rawSegment.slice(coefficient.next);
    if (!segmentSource) return null;
    const parsed = parseGroup(segmentSource, 0, null);
    if (!parsed || parsed.next !== segmentSource.length) return null;
    mergeCounts(total, parsed.counts, coefficient.value);
  }
  return Object.keys(total).length > 0 ? total : null;
}

export function atomCountTotal(counts: AtomCounts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export function selectRandomCompounds<T>(
  library: readonly T[],
  count: number,
  random: () => number = Math.random,
) {
  const pool = [...library];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex]!, pool[index]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

export function buildAtomBundles(compounds: readonly ReactionCompound[]) {
  const totals: Record<string, number> = {};
  for (const compound of compounds) mergeCounts(totals, compound.atomCounts);

  const bundles: AtomBundle[] = [];
  for (const [symbol, total] of Object.entries(totals).sort(([a], [b]) => a.localeCompare(b))) {
    if (total <= 12) {
      for (let index = 0; index < total; index += 1) {
        bundles.push({ id: `${symbol}-${index + 1}`, symbol, count: 1 });
      }
      continue;
    }
    let remaining = total;
    let group = 1;
    while (remaining > 0) {
      const count = Math.min(10, remaining);
      bundles.push({ id: `${symbol}-group-${group}`, symbol, count });
      group += 1;
      remaining -= count;
    }
  }
  return bundles;
}

export function findCompletableCompound(
  pool: AtomCounts,
  compounds: readonly ReactionCompound[],
  completedIds: ReadonlySet<string>,
) {
  return compounds.find((compound) => (
    !completedIds.has(compound.id)
    && Object.entries(compound.atomCounts)
      .every(([symbol, count]) => (pool[symbol] ?? 0) >= count)
  ));
}

export function consumeAtomCounts(pool: AtomCounts, required: AtomCounts) {
  const next = { ...pool };
  for (const [symbol, count] of Object.entries(required)) {
    const remaining = (next[symbol] ?? 0) - count;
    if (remaining < 0) throw new Error(`原子数量不足：${symbol}`);
    if (remaining === 0) delete next[symbol];
    else next[symbol] = remaining;
  }
  return next;
}
