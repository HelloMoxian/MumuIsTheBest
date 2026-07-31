export type PinyinGroupId = "initial" | "final" | "whole";
export type PinyinDirection = "up" | "down" | "left" | "right";

export type PinyinUnit = {
  id: string;
  group: PinyinGroupId;
  value: string;
};

export type PinyinGroup = {
  id: PinyinGroupId;
  label: string;
  shortLabel: string;
  description: string;
  units: readonly PinyinUnit[];
};

export type PinyinCharacter = {
  rank: number;
  character: string;
  pinyin: string;
  words: readonly string[];
};

export type PinyinHighlight = {
  before: string;
  match: string;
  after: string;
};

export type PinyinVoiceCommand =
  | { kind: "move"; direction: PinyinDirection }
  | { kind: "group"; group: PinyinGroupId }
  | { kind: "group-step"; step: -1 | 1 }
  | { kind: "action"; action: "open" | "shuffle" | "close" | "home" };

const INITIAL_VALUES = [
  "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j",
  "q", "x", "zh", "ch", "sh", "r", "z", "c", "s", "y", "w",
] as const;

const FINAL_VALUES = [
  "a", "o", "e", "i", "u", "ü", "ai", "ei", "ui", "ao", "ou", "iu",
  "ie", "üe", "er", "an", "en", "in", "un", "ün", "ang", "eng", "ing", "ong",
] as const;

const WHOLE_VALUES = [
  "zhi", "chi", "shi", "ri", "zi", "ci", "si", "yi", "wu", "yu", "ye",
  "yue", "yuan", "yin", "yun", "ying",
] as const;

function toUnits(group: PinyinGroupId, values: readonly string[]): PinyinUnit[] {
  return values.map((value) => ({ id: `${group}:${value}`, group, value }));
}

export const PINYIN_GROUPS: readonly PinyinGroup[] = [
  {
    id: "initial",
    label: "声母星区",
    shortLabel: "声母",
    description: "音节开头的声音",
    units: toUnits("initial", INITIAL_VALUES),
  },
  {
    id: "final",
    label: "韵母星区",
    shortLabel: "韵母",
    description: "音节里响亮的部分",
    units: toUnits("final", FINAL_VALUES),
  },
  {
    id: "whole",
    label: "整体认读星区",
    shortLabel: "整体认读",
    description: "把整个音节一起读",
    units: toUnits("whole", WHOLE_VALUES),
  },
] as const;

export const PINYIN_UNITS = PINYIN_GROUPS.flatMap((group) => group.units);

const LONG_INITIALS = ["zh", "ch", "sh"] as const;
const DOTTED_U_PREFIXES = ["j", "q", "x", "y"] as const;

export function normalizePinyin(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/u\u0308/g, "ü")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zü]/g, "");
}

function leadingInitial(value: string): string {
  const longInitial = LONG_INITIALS.find((initial) => value.startsWith(initial));
  if (longInitial) return longInitial;
  return INITIAL_VALUES.find((initial) => value.startsWith(initial)) ?? "";
}

function dottedUEquivalentRange(
  normalized: string,
  final: "ü" | "üe" | "ün",
): [number, number] | null {
  const initial = leadingInitial(normalized);
  if (!DOTTED_U_PREFIXES.includes(initial as (typeof DOTTED_U_PREFIXES)[number])) {
    return null;
  }
  const written = final === "ü" ? "u" : final === "üe" ? "ue" : "un";
  const start = normalized.indexOf(written, initial.length);
  return start >= 0 ? [start, start + written.length] : null;
}

export function pinyinMatchRange(
  pinyin: string,
  unit: PinyinUnit,
): [number, number] | null {
  const normalized = normalizePinyin(pinyin);
  if (!normalized) return null;

  if (unit.group === "whole") {
    return normalized === unit.value ? [0, normalized.length] : null;
  }

  if (unit.group === "initial") {
    return leadingInitial(normalized) === unit.value
      ? [0, unit.value.length]
      : null;
  }

  if (unit.value === "ü" || unit.value === "üe" || unit.value === "ün") {
    const explicitStart = normalized.indexOf(unit.value);
    if (explicitStart >= 0) {
      return [explicitStart, explicitStart + unit.value.length];
    }
    return dottedUEquivalentRange(normalized, unit.value);
  }

  const initial = leadingInitial(normalized);
  if (
    (unit.value === "u" || unit.value === "un") &&
    DOTTED_U_PREFIXES.includes(initial as (typeof DOTTED_U_PREFIXES)[number])
  ) {
    return null;
  }
  const start = normalized.indexOf(unit.value, initial.length);
  return start >= 0 ? [start, start + unit.value.length] : null;
}

export function matchesPinyinUnit(pinyin: string, unit: PinyinUnit): boolean {
  return pinyinMatchRange(pinyin, unit) !== null;
}

export function splitHighlightedPinyin(
  pinyin: string,
  unit: PinyinUnit,
): PinyinHighlight {
  const range = pinyinMatchRange(pinyin, unit);
  if (!range) return { before: pinyin, match: "", after: "" };
  const glyphs = Array.from(pinyin);
  return {
    before: glyphs.slice(0, range[0]).join(""),
    match: glyphs.slice(range[0], range[1]).join(""),
    after: glyphs.slice(range[1]).join(""),
  };
}

export function charactersForPinyinUnit<T extends PinyinCharacter>(
  characters: readonly T[],
  unit: PinyinUnit,
): T[] {
  return characters.filter(
    (character) =>
      matchesPinyinUnit(character.pinyin, unit) &&
      character.words.some((word) => word.includes(character.character)),
  );
}

export function samplePinyinCharacters<T>(
  characters: readonly T[],
  count = 6,
  random: () => number = Math.random,
): T[] {
  const shuffled = [...characters];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled.slice(0, Math.max(0, count));
}

export function groupById(groupId: PinyinGroupId): PinyinGroup {
  return PINYIN_GROUPS.find((group) => group.id === groupId) ?? PINYIN_GROUPS[0]!;
}

export function movePinyinSelection(
  groupId: PinyinGroupId,
  currentId: string,
  direction: PinyinDirection,
  columns: number,
): PinyinUnit {
  const units = groupById(groupId).units;
  const currentIndex = Math.max(0, units.findIndex((unit) => unit.id === currentId));
  const safeColumns = Math.max(1, Math.floor(columns));
  const delta = {
    left: -1,
    right: 1,
    up: -safeColumns,
    down: safeColumns,
  }[direction];
  const nextIndex = Math.max(0, Math.min(units.length - 1, currentIndex + delta));
  return units[nextIndex]!;
}

export function stepPinyinGroup(
  current: PinyinGroupId,
  step: -1 | 1,
): PinyinGroup {
  const index = PINYIN_GROUPS.findIndex((group) => group.id === current);
  const nextIndex = (index + step + PINYIN_GROUPS.length) % PINYIN_GROUPS.length;
  return PINYIN_GROUPS[nextIndex]!;
}

export function detectPinyinVoiceCommands(text: string): PinyinVoiceCommand[] {
  const normalized = text
    .toLowerCase()
    .replace(/[\s，。,.!！?？、"'“”‘’]/g, "");

  const actions: PinyinVoiceCommand[] = [];
  if (normalized.includes("返回首页") || normalized.includes("回到首页")) {
    actions.push({ kind: "action", action: "home" });
  } else if (
    normalized.includes("关闭卡片") ||
    normalized.includes("返回拼音表") ||
    normalized === "关闭"
  ) {
    actions.push({ kind: "action", action: "close" });
  } else if (
    normalized.includes("换一批汉字") ||
    normalized.includes("换一批") ||
    normalized.includes("再换一组")
  ) {
    actions.push({ kind: "action", action: "shuffle" });
  } else if (
    normalized.includes("详细信息") ||
    normalized.includes("打开卡片") ||
    normalized === "打开"
  ) {
    actions.push({ kind: "action", action: "open" });
  }

  if (normalized.includes("整体认读区") || normalized.includes("整体音节区")) {
    actions.push({ kind: "group", group: "whole" });
  } else if (normalized.includes("韵母区")) {
    actions.push({ kind: "group", group: "final" });
  } else if (normalized.includes("声母区")) {
    actions.push({ kind: "group", group: "initial" });
  } else if (normalized.includes("下一组") || normalized.includes("下一区")) {
    actions.push({ kind: "group-step", step: 1 });
  } else if (normalized.includes("上一组") || normalized.includes("上一区")) {
    actions.push({ kind: "group-step", step: -1 });
  }

  const directionSource = normalized
    .replace(
      /返回首页|回到首页|关闭卡片|返回拼音表|换一批汉字|换一批|再换一组|详细信息|打开卡片|整体认读区|整体音节区|韵母区|声母区|下一组|下一区|上一组|上一区/g,
      "",
    )
    .replace(/向/g, "");
  const directions = Array.from(directionSource)
    .filter((value) => ["上", "下", "左", "右"].includes(value))
    .map<PinyinVoiceCommand>((value) => ({
      kind: "move",
      direction: ({
        上: "up",
        下: "down",
        左: "left",
        右: "right",
      } as Record<string, PinyinDirection>)[value]!,
    }));

  return [...directions, ...actions];
}
