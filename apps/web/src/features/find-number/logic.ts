export type NumberRangeMaximum = 100 | 1_000 | 10_000 | 100_000;
export type GuessKind = "exact" | "less-than" | "greater-than" | "at-most" | "at-least";
export type VoiceGameCommand = "start" | "end" | "next";

export type CandidateRange = {
  minimum: number;
  maximum: number;
};

export type GuessQuery = {
  kind: GuessKind;
  value: number;
  rawText: string;
};

export type EliminatedSegment = {
  minimum: number;
  maximum: number;
  count: number;
  side: "left" | "right";
};

export type GuessOutcome = {
  query: GuessQuery;
  before: CandidateRange;
  after: CandidateRange;
  eliminated: EliminatedSegment | null;
  eliminatedCount: number;
  remainingCount: number;
  solved: boolean;
  comparison: "lower" | "equal" | "higher";
  answer: boolean;
  responseText: string;
};

const CHINESE_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const SMALL_UNITS: Readonly<Record<string, number>> = {
  十: 10,
  百: 100,
  千: 1_000,
};

function normalizeFullWidthDigits(value: string) {
  return value.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10));
}

function parseChineseSection(value: string) {
  let total = 0;
  let digit = 0;
  for (const character of value) {
    const digitValue = CHINESE_DIGITS[character];
    if (digitValue !== undefined) {
      digit = digitValue;
      continue;
    }
    const unit = SMALL_UNITS[character];
    if (!unit) return null;
    total += (digit || 1) * unit;
    digit = 0;
  }
  return total + digit;
}

export function parseLargeSpokenNumber(raw: string): number | null {
  const token = normalizeFullWidthDigits(raw)
    .trim()
    .replace(/[,\s，。.!！?？]/g, "");
  if (!token) return null;
  if (/^\d+$/.test(token)) {
    const value = Number.parseInt(token, 10);
    return Number.isSafeInteger(value) ? value : null;
  }
  if (!/^[零〇一二两三四五六七八九十百千万]+$/.test(token)) return null;

  if (!/[十百千万]/.test(token)) {
    const digits = [...token].map((character) => CHINESE_DIGITS[character]);
    return digits.some((digit) => digit === undefined)
      ? null
      : Number(digits.join(""));
  }

  const pieces = token.split("万");
  if (pieces.length > 2) return null;
  if (pieces.length === 1) return parseChineseSection(token);
  const high = pieces[0] ? parseChineseSection(pieces[0]) : 1;
  const low = pieces[1] ? parseChineseSection(pieces[1]) : 0;
  return high === null || low === null ? null : high * 10_000 + low;
}

function normalizedSpeech(value: string) {
  return normalizeFullWidthDigits(value)
    .toLowerCase()
    .replace(/[\s，。,.!！?？=＝]/g, "");
}

export function detectVoiceGameCommand(transcript: string): VoiceGameCommand | null {
  const normalized = normalizedSpeech(transcript);
  if (
    normalized.includes("下一局")
    || normalized.includes("再来一局")
    || normalized.includes("重新开始")
    || normalized.includes("next")
    || normalized.includes("restart")
  ) return "next";
  if (
    normalized.includes("结束一局")
    || normalized.includes("结束游戏")
    || normalized === "结束"
    || normalized.includes("stopgame")
    || normalized === "end"
  ) return "end";
  if (
    normalized.includes("开始一局")
    || normalized.includes("开始游戏")
    || normalized === "开始"
    || normalized.includes("start")
  ) return "start";
  return null;
}

export function parseGuessQuery(transcript: string): GuessQuery | null {
  const normalized = normalizeFullWidthDigits(transcript)
    .replace(/[，。,.!！?？]/g, "")
    .replace(/\s/g, "");
  const tokens = normalized.match(/[0-9]+|[零〇一二两三四五六七八九十百千万]+/g);
  const token = tokens?.at(-1);
  if (!token) return null;
  const value = parseLargeSpokenNumber(token);
  if (value === null) return null;

  let kind: GuessKind = "exact";
  if (/不大于|小于等于|不超过|最多/.test(normalized)) {
    kind = "at-most";
  } else if (/不小于|大于等于|不少于|至少/.test(normalized)) {
    kind = "at-least";
  } else if (/小于|少于|不到/.test(normalized) || (/比/.test(normalized) && /小|少/.test(normalized))) {
    kind = "less-than";
  } else if (/大于|多于|超过/.test(normalized) || (/比/.test(normalized) && /大|多/.test(normalized))) {
    kind = "greater-than";
  }

  return { kind, value, rawText: transcript.trim() };
}

export function rangeSize(range: CandidateRange) {
  return Math.max(0, range.maximum - range.minimum + 1);
}

export function rangeMidpoint(range: CandidateRange) {
  return Math.floor((range.minimum + range.maximum) / 2);
}

export function approximateQuestionsRemaining(range: CandidateRange) {
  const candidates = rangeSize(range);
  return candidates <= 1 ? 0 : Math.ceil(Math.log2(candidates + 1));
}

export function generateSecret(
  maximum: NumberRangeMaximum,
  random: () => number = Math.random,
) {
  const value = Math.min(0.999999999, Math.max(0, random()));
  return Math.floor(value * (maximum + 1));
}

export function queryLabel(query: Pick<GuessQuery, "kind" | "value">) {
  const value = formatInteger(query.value);
  if (query.kind === "less-than") return `小于 ${value} 吗？`;
  if (query.kind === "greater-than") return `大于 ${value} 吗？`;
  if (query.kind === "at-most") return `不超过 ${value} 吗？`;
  if (query.kind === "at-least") return `至少是 ${value} 吗？`;
  return `是 ${value} 吗？`;
}

function answerText(
  query: GuessQuery,
  secret: number,
  comparison: GuessOutcome["comparison"],
  answer: boolean,
) {
  const value = formatInteger(query.value);
  if (query.kind === "exact") {
    if (comparison === "equal") return `找到了！神秘数字就是 ${value}`;
    return comparison === "higher"
      ? `神秘数字比 ${value} 大`
      : `神秘数字比 ${value} 小`;
  }
  if (query.kind === "less-than") {
    return answer ? `对，神秘数字小于 ${value}` : `不是，神秘数字大于或等于 ${value}`;
  }
  if (query.kind === "greater-than") {
    return answer ? `对，神秘数字大于 ${value}` : `不是，神秘数字小于或等于 ${value}`;
  }
  if (query.kind === "at-most") {
    return answer ? `对，神秘数字不超过 ${value}` : `不是，神秘数字大于 ${value}`;
  }
  return answer ? `对，神秘数字至少是 ${value}` : `不是，神秘数字小于 ${value}`;
}

export function applyGuess(
  before: CandidateRange,
  secret: number,
  query: GuessQuery,
): GuessOutcome {
  if (secret < before.minimum || secret > before.maximum) {
    throw new Error("Secret must remain inside the candidate range");
  }

  const comparison = secret === query.value
    ? "equal"
    : secret > query.value ? "higher" : "lower";
  let answer = comparison === "equal";
  let nextMinimum = before.minimum;
  let nextMaximum = before.maximum;

  if (query.kind === "exact") {
    if (comparison === "equal") {
      nextMinimum = secret;
      nextMaximum = secret;
    } else if (comparison === "higher") {
      nextMinimum = Math.max(before.minimum, query.value + 1);
    } else {
      nextMaximum = Math.min(before.maximum, query.value - 1);
    }
  } else if (query.kind === "less-than") {
    answer = secret < query.value;
    if (answer) nextMaximum = Math.min(before.maximum, query.value - 1);
    else nextMinimum = Math.max(before.minimum, query.value);
  } else if (query.kind === "greater-than") {
    answer = secret > query.value;
    if (answer) nextMinimum = Math.max(before.minimum, query.value + 1);
    else nextMaximum = Math.min(before.maximum, query.value);
  } else if (query.kind === "at-most") {
    answer = secret <= query.value;
    if (answer) nextMaximum = Math.min(before.maximum, query.value);
    else nextMinimum = Math.max(before.minimum, query.value + 1);
  } else {
    answer = secret >= query.value;
    if (answer) nextMinimum = Math.max(before.minimum, query.value);
    else nextMaximum = Math.min(before.maximum, query.value - 1);
  }

  const after = { minimum: nextMinimum, maximum: nextMaximum };
  const eliminatedCount = rangeSize(before) - rangeSize(after);
  let eliminated: EliminatedSegment | null = null;
  if (nextMinimum > before.minimum) {
    eliminated = {
      minimum: before.minimum,
      maximum: nextMinimum - 1,
      count: nextMinimum - before.minimum,
      side: "left",
    };
  } else if (nextMaximum < before.maximum) {
    eliminated = {
      minimum: nextMaximum + 1,
      maximum: before.maximum,
      count: before.maximum - nextMaximum,
      side: "right",
    };
  }

  return {
    query,
    before,
    after,
    eliminated,
    eliminatedCount,
    remainingCount: rangeSize(after),
    solved: query.kind === "exact" && comparison === "equal",
    comparison,
    answer,
    responseText: answerText(query, secret, comparison, answer),
  };
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}
