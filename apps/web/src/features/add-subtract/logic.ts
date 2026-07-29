export type QuestionCount = 5 | 10 | 20;
export type OperationType = "addition" | "subtraction" | "mixed";
export type SpeechType = "none" | "zh" | "en";
export type MathOperator = "+" | "-";

export type PracticeQuestion = {
  id: string;
  left: number;
  right: number;
  operator: MathOperator;
  answer: number;
};

export type CompletedQuestion = PracticeQuestion & {
  firstAttemptCorrect: boolean;
  calculationDurationMs: number;
  wrongAnswers: number[];
};

export type AttemptEvidence = {
  wrongAnswers: Set<number>;
  hadConfirmedWrong: boolean;
};

export type StoredPracticeSession = {
  id: string;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
  questionCount: QuestionCount;
  operationType: OperationType;
  speechType: SpeechType;
  childAge: number;
  totalDurationMs: number;
  calculationDurationMs: number;
  questions: CompletedQuestion[];
  correctCount: number;
  accuracy: number;
};

export type HistoryGroup = {
  key: string;
  questionCount: QuestionCount;
  operationType: OperationType;
  sessions: number;
  totalDurationMs: number;
  averageQuestionDurationMs: number;
  calculationDurationMs: number;
  childAge: number;
  accuracy: number;
};

const chineseDigitValues: Record<string, number> = {
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

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function questionPool(operator: MathOperator): PracticeQuestion[] {
  const pool: PracticeQuestion[] = [];
  for (let left = 0; left <= 20; left += 1) {
    for (let right = 0; right <= 20; right += 1) {
      const answer = operator === "+" ? left + right : left - right;
      if (answer < 0 || answer > 20) continue;
      pool.push({ id: "", left, right, operator, answer });
    }
  }
  return pool;
}

const additionPool = questionPool("+");
const subtractionPool = questionPool("-");

export function generateQuestions(
  count: QuestionCount,
  operationType: OperationType,
  random: () => number = Math.random,
): PracticeQuestion[] {
  let selected: PracticeQuestion[];
  if (operationType === "addition") {
    selected = shuffle(additionPool, random).slice(0, count);
  } else if (operationType === "subtraction") {
    selected = shuffle(subtractionPool, random).slice(0, count);
  } else {
    const additionCount = Math.ceil(count / 2);
    const subtractionCount = count - additionCount;
    selected = shuffle([
      ...shuffle(additionPool, random).slice(0, additionCount),
      ...shuffle(subtractionPool, random).slice(0, subtractionCount),
    ], random);
  }

  return selected.map((question, index) => ({
    ...question,
    id: `question-${index + 1}-${question.left}-${question.operator === "+" ? "plus" : "minus"}-${question.right}`,
  }));
}

function normalizeFullWidthDigits(value: string) {
  return value.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10));
}

export function parseSpokenNumber(raw: string): number | null {
  const token = normalizeFullWidthDigits(raw)
    .trim()
    .replace(/[，。,.!?！？]/g, "");

  if (/^\d+$/.test(token)) return Number.parseInt(token, 10);
  if (!token || !/^[零〇一二两三四五六七八九十]+$/.test(token)) return null;
  if (/^[零〇]+$/.test(token)) return 0;

  const withoutLeadingZero = token.replace(/^[零〇]+/, "");
  if (!withoutLeadingZero) return 0;
  if (!withoutLeadingZero.includes("十")) {
    return chineseDigitValues[withoutLeadingZero] ?? null;
  }

  const [tensText, onesText, extra] = withoutLeadingZero.split("十");
  if (extra !== undefined) return null;
  const tens = tensText === "" || tensText === "一" ? 1 : chineseDigitValues[tensText];
  if (tens === undefined || tens === 0) return null;
  const ones = onesText === "" ? 0 : chineseDigitValues[onesText];
  if (ones === undefined) return null;
  return tens * 10 + ones;
}

export function extractAnswerCandidates(transcript: string): number[] {
  const normalized = normalizeFullWidthDigits(transcript);
  const markerPattern = /(?:等于|=|＝)/g;
  const markers = [...normalized.matchAll(markerPattern)];
  const answers: number[] = [];

  for (const marker of markers) {
    const start = (marker.index ?? 0) + marker[0].length;
    const tail = normalized.slice(start);
    const token = tail.match(/^\s*([0-9零〇一二两三四五六七八九十]{1,8})/)?.[1];
    if (!token) continue;
    const value = parseSpokenNumber(token);
    if (value !== null) answers.push(value);
  }

  return answers;
}

export function decideTranscriptAnswer(
  transcript: string,
  expectedAnswer: number,
): { kind: "correct"; answer: number } | { kind: "wrong"; answer: number } | { kind: "none" } {
  const candidates = extractAnswerCandidates(transcript);
  if (candidates.includes(expectedAnswer)) {
    return { kind: "correct", answer: expectedAnswer };
  }
  const latestCandidate = candidates.at(-1);
  return latestCandidate === undefined
    ? { kind: "none" }
    : { kind: "wrong", answer: latestCandidate };
}

export function recordConfirmedWrong(evidence: AttemptEvidence, answer: number): void {
  evidence.hadConfirmedWrong = true;
  evidence.wrongAnswers.add(answer);
}

export function isStartCommand(transcript: string): boolean {
  const normalized = transcript.toLowerCase().replace(/[\s，。,.!?！？]/g, "");
  return normalized.includes("开始") || normalized.includes("start");
}

export function isRestartCommand(transcript: string): boolean {
  const normalized = transcript.toLowerCase().replace(/[\s，。,.!?！？]/g, "");
  return normalized.includes("再来一局") || normalized.includes("restart");
}

export function operationLabel(operationType: OperationType): string {
  if (operationType === "addition") return "加法";
  if (operationType === "subtraction") return "减法";
  return "加减混合";
}

export function speechQuestion(question: PracticeQuestion, speechType: SpeechType): string {
  if (speechType === "none") return "";
  if (speechType === "zh") {
    return `${question.left}${question.operator === "+" ? "加" : "减"}${question.right}等于多少？`;
  }
  const englishNumbers = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  ];
  return `${englishNumbers[question.left]} ${question.operator === "+" ? "plus" : "minus"} ${englishNumbers[question.right]} equals what?`;
}

export function aggregateHistory(sessions: StoredPracticeSession[]): HistoryGroup[] {
  const groups = new Map<string, StoredPracticeSession[]>();
  for (const session of sessions) {
    const key = `${session.questionCount}-${session.operationType}`;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }

  return [...groups.entries()]
    .map(([key, groupedSessions]) => {
      const totalQuestions = groupedSessions.reduce((sum, session) => sum + session.questionCount, 0);
      const totalCorrect = groupedSessions.reduce((sum, session) => sum + session.correctCount, 0);
      const totalCalculationMs = groupedSessions.reduce((sum, session) => sum + session.calculationDurationMs, 0);
      const latest = [...groupedSessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
      return {
        key,
        questionCount: latest.questionCount,
        operationType: latest.operationType,
        sessions: groupedSessions.length,
        totalDurationMs: Math.round(groupedSessions.reduce((sum, session) => sum + session.totalDurationMs, 0) / groupedSessions.length),
        averageQuestionDurationMs: Math.round(totalCalculationMs / totalQuestions),
        calculationDurationMs: Math.round(totalCalculationMs / groupedSessions.length),
        childAge: latest.childAge,
        accuracy: totalQuestions ? totalCorrect / totalQuestions : 0,
      } satisfies HistoryGroup;
    })
    .sort((a, b) => a.questionCount - b.questionCount || a.operationType.localeCompare(b.operationType));
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, "0")}秒` : `${seconds}秒`;
}
