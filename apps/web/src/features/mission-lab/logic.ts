import { parseSpokenNumber } from "../add-subtract/logic";

export type MissionGameId =
  | "experiment-master"
  | "matter-world"
  | "pinyin-bridge"
  | "word-orbit"
  | "unit-magic"
  | "force-lab"
  | "light-shadow"
  | "solar-route"
  | "number-war"
  | "pattern-detective"
  | "body-station"
  | "cell-universe";

export type MissionChoice = {
  id: string;
  label: string;
  detail?: string;
  voiceAliases?: readonly string[];
};

export type MissionVisual = {
  mode:
    | "beam"
    | "body"
    | "cell"
    | "letters"
    | "number"
    | "orbit"
    | "particles"
    | "scale"
    | "sequence"
    | "word";
  eyebrow: string;
  title: string;
  tokens: readonly string[];
};

export type LearningMission = {
  id: string;
  kind: "choice" | "sequence";
  prompt: string;
  hint: string;
  conclusion: string;
  explanation: string;
  choices: readonly MissionChoice[];
  answer: string | readonly string[];
  visual: MissionVisual;
};

export type MissionGameDefinition = {
  id: MissionGameId;
  route: string;
  subject: string;
  title: string;
  mark: string;
  subtitle: string;
  introduction: string;
  accent: "cyan" | "green" | "orange" | "pink" | "violet" | "yellow";
  speechLanguage: "zh-CN" | "en-US";
  goals: readonly [string, string, string];
  missions: readonly LearningMission[];
};

export type MissionResult = {
  missionId: string;
  conclusion: string;
  discoveredFirstTry: boolean;
};

export type MissionGameCommand =
  | "start"
  | "next"
  | "repeat"
  | "check"
  | "end"
  | "continue-voice"
  | null;

export function shuffle<T>(
  values: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function selectMissions(
  definition: MissionGameDefinition,
  count: 5 | 10,
  random: () => number = Math.random,
): LearningMission[] {
  if (definition.missions.length < count) {
    throw new Error(`${definition.id} 至少需要 ${count} 个任务`);
  }
  return shuffle(definition.missions, random).slice(0, count);
}

export function isMissionAnswer(
  mission: LearningMission,
  answer: string | readonly string[],
): boolean {
  if (mission.kind === "choice") {
    return typeof answer === "string" && answer === mission.answer;
  }
  return (
    Array.isArray(answer)
    && Array.isArray(mission.answer)
    && answer.length === mission.answer.length
    && answer.every((value, index) => value === mission.answer[index])
  );
}

export function normalizeVoiceText(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[，。！？、,.!?：:；;“”"'‘’（）()【】\[\]\s]/g, "");
}

export function parseVoiceChoice(
  text: string,
  choices: readonly MissionChoice[],
): string | null {
  const normalized = normalizeVoiceText(text);
  if (!normalized) return null;
  const candidates = choices.flatMap((choice) => {
    const labelParts = choice.label.match(/[\p{Script=Han}]+|[a-zA-Z]+|\d+/gu) ?? [];
    return [
      { id: choice.id, phrase: choice.label },
      ...labelParts.map((phrase) => ({ id: choice.id, phrase })),
      ...(choice.voiceAliases ?? []).map((phrase) => ({ id: choice.id, phrase })),
    ];
  });
  const match = candidates
    .map((candidate) => ({
      ...candidate,
      phrase: normalizeVoiceText(candidate.phrase),
    }))
    .filter((candidate) => candidate.phrase.length > 0 && normalized.includes(candidate.phrase))
    .sort((left, right) => right.phrase.length - left.phrase.length)[0];
  if (match) return match.id;

  const spokenNumbers = normalized.match(/[零〇一二两三四五六七八九十百]+/g) ?? [];
  for (const token of spokenNumbers) {
    const value = parseSpokenNumber(token);
    if (value === null) continue;
    const numericChoice = choices.find((choice) => Number(choice.label) === value);
    if (numericChoice) return numericChoice.id;
  }

  const ordinalWords = ["一|1", "二|两|2", "三|3", "四|4", "五|5"];
  const ordinal = ordinalWords.findIndex((word) => (
    new RegExp(`(?:第(?:${word})(?:个|项|号|种|颗|张|条)?|(?:${word})(?:个|项|号|种|颗|张|条))`).test(normalized)
    || new RegExp(`^(?:${word})$`).test(normalized)
  ));
  return ordinal >= 0 && ordinal < choices.length ? choices[ordinal]!.id : null;
}

export function detectMissionGameCommand(text: string): MissionGameCommand {
  const normalized = normalizeVoiceText(text);
  if (/继续识别|继续听|打开麦克风/.test(normalized)) return "continue-voice";
  if (/再听一遍|重新读|读一遍|重复题目/.test(normalized)) return "repeat";
  if (/检查顺序|检查轨道|看看顺序|确认顺序/.test(normalized)) return "check";
  if (/下一题|下一个|继续下一/.test(normalized)) return "next";
  if (/结束一局|结束游戏|结束任务|先不玩|返回大厅/.test(normalized)) return "end";
  if (/开始一局|开始游戏|开始任务|再来一局|重新开始|出发|开始/.test(normalized)) return "start";
  return null;
}

export function summarizeMissionResults(
  results: readonly MissionResult[],
  expectedCount: number,
) {
  const firstTry = results.filter((result) => result.discoveredFirstTry).length;
  return {
    completed: results.length,
    expected: expectedCount,
    firstTry,
    observed: results.length - firstTry,
    completeRound: results.length === expectedCount,
  };
}

export function validateMissionGameDefinition(
  definition: MissionGameDefinition,
): string[] {
  const issues: string[] = [];
  if (definition.missions.length < 10) issues.push("任务数量少于 10");
  if (new Set(definition.missions.map((mission) => mission.id)).size !== definition.missions.length) {
    issues.push("任务 ID 不唯一");
  }
  for (const mission of definition.missions) {
    const ids = mission.choices.map((choice) => choice.id);
    if (new Set(ids).size !== ids.length) issues.push(`${mission.id} 的候选项 ID 不唯一`);
    if (mission.kind === "choice") {
      if (typeof mission.answer !== "string" || !ids.includes(mission.answer)) {
        issues.push(`${mission.id} 的单选答案不合法`);
      }
    } else if (
      !Array.isArray(mission.answer)
      || mission.answer.length !== ids.length
      || new Set(mission.answer).size !== ids.length
      || mission.answer.some((answer) => !ids.includes(answer))
    ) {
      issues.push(`${mission.id} 的排序答案不完整`);
    }
    if (mission.explanation.length < 12) issues.push(`${mission.id} 的知识解释过短`);
    if (mission.visual.tokens.length === 0) issues.push(`${mission.id} 缺少观察信息`);
  }
  return issues;
}
