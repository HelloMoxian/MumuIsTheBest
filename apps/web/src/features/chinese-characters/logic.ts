export type CharacterPoolSize = 500 | 1_000 | 1_500 | 2_000 | 2_500;
export type ExerciseCount = 5 | 10;

export type CommonCharacter = {
  rank: number;
  character: string;
  pinyin: string;
  radical: string;
  strokes: number;
  standardNumber: string | null;
  meaning: string;
  words: string[];
  sentence: string;
  idioms: {
    word: string;
    pinyin: string;
    meaning: string;
  }[];
};

export type CharacterProgressRecord = {
  id: string;
  character: string;
  rank: number;
  studiedCount: number;
  knownCount: number;
  notKnownCount: number;
  lastStudiedAt: string;
  lastKnownAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CharacterProgressFile = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  records: CharacterProgressRecord[];
};

export type CharacterVoiceCommand =
  | "start"
  | "known"
  | "next"
  | "reveal"
  | "end"
  | "restart"
  | "list"
  | "back";

export type RoundResult = {
  character: CommonCharacter;
  known: boolean;
  studiedAt: string;
};

function normalizedSpeech(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s，。,.!！?？、"'“”‘’]/g, "");
}

export function detectCharacterVoiceCommand(
  transcript: string,
): CharacterVoiceCommand | null {
  const value = normalizedSpeech(transcript);
  if (!value) return null;
  if (
    value.includes("我会了") ||
    value.includes("这个会了") ||
    value === "会了" ||
    value.includes("iknow")
  ) {
    return "known";
  }
  if (
    value.includes("文字清单") ||
    value.includes("汉字清单") ||
    value.includes("学习清单") ||
    value.includes("查看清单")
  ) {
    return "list";
  }
  if (
    value.includes("下一局") ||
    value.includes("再来一局") ||
    value.includes("重新开始") ||
    value.includes("restart")
  ) {
    return "restart";
  }
  if (
    value.includes("下一个") ||
    value.includes("下个字") ||
    value.includes("next")
  ) {
    return "next";
  }
  if (
    value.includes("显示答案") ||
    value.includes("看看拼音") ||
    value.includes("详细信息") ||
    value.includes("给我提示") ||
    value === "提示"
  ) {
    return "reveal";
  }
  if (
    value.includes("结束一局") ||
    value.includes("结束练习") ||
    value === "结束" ||
    value === "end"
  ) {
    return "end";
  }
  if (
    value.includes("开始一局") ||
    value.includes("开始练习") ||
    value === "开始" ||
    value === "start"
  ) {
    return "start";
  }
  if (
    value === "返回" ||
    value.includes("返回设置") ||
    value.includes("回到设置") ||
    value === "back"
  ) {
    return "back";
  }
  return null;
}

function shuffled<T>(items: readonly T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function ageInDays(value: string | null, now: number) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(0, (now - timestamp) / 86_400_000)
    : Number.POSITIVE_INFINITY;
}

function weaknessScore(record: CharacterProgressRecord, now: number) {
  const uncertainty = record.notKnownCount - record.knownCount;
  return (
    uncertainty * 100 +
    Math.min(30, ageInDays(record.lastStudiedAt, now))
  );
}

function reviewScore(record: CharacterProgressRecord, now: number) {
  const successRatio = record.knownCount / record.studiedCount;
  return ageInDays(record.lastKnownAt, now) * 10 - successRatio;
}

export function selectAdaptiveCharacters(
  pool: readonly CommonCharacter[],
  records: readonly CharacterProgressRecord[],
  count: ExerciseCount,
  random: () => number = Math.random,
  now = Date.now(),
) {
  const progress = new Map(records.map((record) => [record.character, record]));
  const weak = [];
  const fresh = [];
  const review = [];

  for (const character of pool) {
    const record = progress.get(character.character);
    if (!record) {
      fresh.push(character);
    } else if (record.notKnownCount >= record.knownCount) {
      weak.push(character);
    } else {
      review.push(character);
    }
  }

  weak.sort(
    (left, right) =>
      weaknessScore(progress.get(right.character)!, now) -
      weaknessScore(progress.get(left.character)!, now),
  );
  review.sort(
    (left, right) =>
      reviewScore(progress.get(right.character)!, now) -
      reviewScore(progress.get(left.character)!, now),
  );

  const weakTarget = Math.ceil(count * 0.5);
  const freshTarget = Math.max(1, Math.floor(count * 0.3));
  const selected = [
    ...weak.slice(0, weakTarget),
    ...shuffled(fresh, random).slice(0, freshTarget),
  ];
  const selectedCharacters = new Set(
    selected.map((character) => character.character),
  );
  const fillCandidates = [
    ...review,
    ...weak.slice(weakTarget),
    ...shuffled(fresh, random).slice(freshTarget),
  ].filter((character) => !selectedCharacters.has(character.character));

  for (const character of fillCandidates) {
    if (selected.length >= count) break;
    selected.push(character);
    selectedCharacters.add(character.character);
  }

  return shuffled(selected.slice(0, count), random);
}

export function mergeProgressRecord(
  records: readonly CharacterProgressRecord[],
  record: CharacterProgressRecord,
) {
  const next = records.filter((item) => item.character !== record.character);
  next.push(record);
  return next.sort((left, right) => left.rank - right.rank);
}

export function summarizeRound(results: readonly RoundResult[]) {
  const knownCount = results.filter((result) => result.known).length;
  return {
    studiedCount: results.length,
    knownCount,
    reviewCount: results.length - knownCount,
  };
}

export function poolSizeFromPath(pathname: string): CharacterPoolSize {
  const value = Number(pathname.split("/").filter(Boolean).at(-1));
  return [500, 1_000, 1_500, 2_000, 2_500].includes(value)
    ? (value as CharacterPoolSize)
    : 500;
}
