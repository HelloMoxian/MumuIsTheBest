import { browserTts, type TtsResult } from "../speech";
import {
  getExperienceSnapshot,
  setGlobalSpeechStatus,
  type ReadAloudMode,
} from "./experience-store";
import { translateUiText } from "./translations";

export type LearningSpeechMoment = {
  zh: string;
  en: string;
  bilingualAudioSrc?: string;
};

const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const ENGLISH_SMALL = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
] as const;
const ENGLISH_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"] as const;

function chineseInteger(value: number): string {
  if (value === 0) return CHINESE_DIGITS[0];
  if (value < 0) return `负${chineseInteger(-value)}`;
  if (value >= 100_000_000) {
    const high = Math.floor(value / 100_000_000);
    const low = value % 100_000_000;
    return `${chineseInteger(high)}亿${low ? `${low < 10_000_000 ? "零" : ""}${chineseInteger(low)}` : ""}`;
  }
  if (value >= 10_000) {
    const high = Math.floor(value / 10_000);
    const low = value % 10_000;
    return `${chineseInteger(high)}万${low ? `${low < 1_000 ? "零" : ""}${chineseInteger(low)}` : ""}`;
  }
  const units = [1_000, 100, 10, 1] as const;
  const names = ["千", "百", "十", ""] as const;
  let remaining = value;
  let result = "";
  let pendingZero = false;
  units.forEach((unit, index) => {
    const digit = Math.floor(remaining / unit);
    remaining %= unit;
    if (digit > 0) {
      if (pendingZero && result) result += "零";
      if (!(unit === 10 && digit === 1 && !result)) result += CHINESE_DIGITS[digit];
      result += names[index];
      pendingZero = false;
    } else if (result && remaining > 0) {
      pendingZero = true;
    }
  });
  return result;
}

export function numberToChinese(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return chineseInteger(value);
  const [integer, decimal = ""] = String(value).split(".");
  return `${chineseInteger(Number(integer))}点${[...decimal].map((digit) => CHINESE_DIGITS[Number(digit)]).join("")}`;
}

function englishBelowThousand(value: number): string {
  if (value < 20) return ENGLISH_SMALL[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return `${ENGLISH_TENS[tens]}${ones ? ` ${ENGLISH_SMALL[ones]}` : ""}`;
  }
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return `${ENGLISH_SMALL[hundreds]} hundred${rest ? ` ${englishBelowThousand(rest)}` : ""}`;
}

function englishInteger(value: number): string {
  if (value === 0) return ENGLISH_SMALL[0];
  if (value < 0) return `negative ${englishInteger(-value)}`;
  if (value >= 1_000_000_000) {
    const high = Math.floor(value / 1_000_000_000);
    const low = value % 1_000_000_000;
    return `${englishInteger(high)} billion${low ? ` ${englishInteger(low)}` : ""}`;
  }
  if (value >= 1_000_000) {
    const high = Math.floor(value / 1_000_000);
    const low = value % 1_000_000;
    return `${englishInteger(high)} million${low ? ` ${englishInteger(low)}` : ""}`;
  }
  if (value >= 1_000) {
    const high = Math.floor(value / 1_000);
    const low = value % 1_000;
    return `${englishBelowThousand(high)} thousand${low ? ` ${englishBelowThousand(low)}` : ""}`;
  }
  return englishBelowThousand(value);
}

export function numberToEnglish(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return englishInteger(value);
  const [integer, decimal = ""] = String(value).split(".");
  return `${englishInteger(Number(integer))} point ${[...decimal].map((digit) => ENGLISH_SMALL[Number(digit)]).join(" ")}`;
}

function replaceNumbers(expression: string, formatter: (value: number) => string) {
  return expression.replace(/\d+(?:\.\d+)?/g, (token) => formatter(Number(token)));
}

export function arithmeticExpressionSpeech(expression: string): LearningSpeechMoment {
  const compact = expression.replace(/\s+/g, " ").trim();
  const zh = replaceNumbers(compact, numberToChinese)
    .replaceAll("+", " 加 ")
    .replaceAll("−", " 减 ")
    .replaceAll("-", " 减 ")
    .replaceAll("×", " 乘以 ")
    .replaceAll("*", " 乘以 ")
    .replaceAll("÷", " 除以 ")
    .replaceAll("/", " 除以 ")
    .replaceAll("=", " 等于 ")
    .replaceAll("(", " 左括号 ")
    .replaceAll(")", " 右括号 ")
    .replace(/\s+/g, " ")
    .trim();
  const en = replaceNumbers(compact, numberToEnglish)
    .replaceAll("+", " plus ")
    .replaceAll("−", " minus ")
    .replaceAll("-", " minus ")
    .replaceAll("×", " times ")
    .replaceAll("*", " times ")
    .replaceAll("÷", " divided by ")
    .replaceAll("/", " divided by ")
    .replaceAll("=", " equals ")
    .replaceAll("(", " open parenthesis ")
    .replaceAll(")", " close parenthesis ")
    .replace(/\s+/g, " ")
    .trim();
  return { zh, en };
}

export function arithmeticResultSpeech(expression: string, answer: number): LearningSpeechMoment {
  const cleanExpression = expression.replace(/\s*=\s*[?？]?\s*$/u, "").trim();
  return arithmeticExpressionSpeech(`${cleanExpression} = ${answer}`);
}

export function findNumberResultSpeech(secret: number, questionCount: number): LearningSpeechMoment {
  return {
    zh: `找到啦！神秘数字是${numberToChinese(secret)}。你用了${numberToChinese(questionCount)}次提问。`,
    en: `You found it! The mystery number is ${numberToEnglish(secret)}. You used ${numberToEnglish(questionCount)} questions.`,
  };
}

const CAT_MOUSE_DISCOVERIES: Readonly<Record<string, { zh: string; en: string }>> = {
  "sum-difference": { zh: "先把总高度和相差的部分合起来，再平均分成两份。", en: "Combine the total height and the difference, then split it into two equal parts." },
  "stack-add": { zh: "用总高度减去台子的高度。", en: "Subtract the platform height from the total height." },
  "height-difference": { zh: "把已知高度和相差的部分加起来。", en: "Add the known height and the difference." },
  "double-plus": { zh: "先减去短板，再平均分成长木板。", en: "Subtract the short board, then share the rest equally among the long boards." },
  "triple-plus": { zh: "先减去短板，再平均分成长木板。", en: "Subtract the short board, then share the rest equally among the long boards." },
  "share-two": { zh: "把奶酪平均分成两份。", en: "Share the cheese equally into two groups." },
  "share-three": { zh: "把奶酪平均分成三份。", en: "Share the cheese equally into three groups." },
  "double-and-single": { zh: "把总高度平均分成三份，找到一份的高度。", en: "Split the total height into three equal parts to find one part." },
};

export function catMouseResultSpeech(input: {
  kind: string;
  answer: number;
  unit: string;
  equation: string;
}): LearningSpeechMoment {
  const discovery = CAT_MOUSE_DISCOVERIES[input.kind] ?? {
    zh: "把图片线索变成算式。",
    en: "Turn the picture clues into an equation.",
  };
  const equation = arithmeticExpressionSpeech(input.equation);
  const unitEn = input.unit === "厘米" ? "centimeters" : input.unit === "块" ? "pieces" : translateUiText(input.unit);
  return {
    zh: `算对啦！${discovery.zh}答案是${numberToChinese(input.answer)}${input.unit}。算式是，${equation.zh}。`,
    en: `That's right! ${discovery.en} The answer is ${numberToEnglish(input.answer)} ${unitEn}. The equation is ${equation.en}.`,
  };
}

export function functionDiscoverySpeech(name: string, equation: string): LearningSpeechMoment {
  return {
    zh: `${name}已经点亮。公式是${equation}。拨动参数，看看曲线怎样变化。`,
    en: `The ${translateUiText(name)} is now glowing. The formula is ${equation}. Change a parameter and watch how the curve moves.`,
  };
}

export function chemistryDiscoverySpeech(input: {
  formula: string;
  nameZh: string;
  nameEn?: string;
}): LearningSpeechMoment {
  return {
    zh: `新物质合成成功。它是${input.nameZh}，化学式是${input.formula}。`,
    en: `A new substance has been made. It is ${input.nameEn ?? translateUiText(input.nameZh)}. Its formula is ${input.formula}.`,
  };
}

export function elementDiscoverySpeech(input: {
  atomicNumber: number;
  symbol: string;
  nameZh: string;
  nameEn?: string;
}): LearningSpeechMoment {
  return {
    zh: `这是${input.nameZh}，元素符号${input.symbol}，原子序数${numberToChinese(input.atomicNumber)}。`,
    en: `This is ${input.nameEn ?? translateUiText(input.nameZh)}, symbol ${input.symbol}, atomic number ${numberToEnglish(input.atomicNumber)}.`,
  };
}

export function pinyinDiscoverySpeech(syllable: string, characters: string[]): LearningSpeechMoment {
  return {
    zh: `这个拼音是${syllable}。可以在${characters.join("、")}这些汉字里听到它。`,
    en: `This Pinyin sound is ${syllable}. Listen for it in these Chinese characters: ${characters.join(", ")}.`,
  };
}

export function characterDiscoverySpeech(input: {
  character: string;
  pinyin: string;
  meaningZh?: string;
  meaningEn?: string;
}): LearningSpeechMoment {
  return {
    zh: `${input.character}，拼音${input.pinyin}。${input.meaningZh ?? "看看它的词语和句子。"}`,
    en: `The Chinese character is ${input.character}. Its Pinyin is ${input.pinyin}. ${input.meaningEn ?? "Now look at its words and example sentence."}`,
  };
}

export function learningConclusionSpeech(zh: string, en?: string): LearningSpeechMoment {
  return { zh, en: en ?? translateUiText(zh) };
}

export const STARTUP_GREETINGS: readonly LearningSpeechMoment[] = [
  { zh: "你好，木木。我们开始学习吧！", en: "Hello, Mumu. Let's start learning!" },
  { zh: "你好，木木。今天想探索什么？", en: "Hello, Mumu. What would you like to explore today?" },
  { zh: "木木，你准备好了吗？我们一起发现新知识吧！", en: "Mumu, are you ready? Let's discover something new together!" },
  { zh: "你好！先认真听，再勇敢试一试。", en: "Hello! Listen carefully, then give it a brave try." },
  { zh: "木木，今天的天气会是什么样呢？", en: "Mumu, what will the weather be like today?" },
] as const;

let activeSpeechId = 0;
let activeRecordedAudio: {
  audio: HTMLAudioElement;
  resolve: (result: TtsResult) => void;
} | null = null;

function stopRecordedAudio() {
  const active = activeRecordedAudio;
  activeRecordedAudio = null;
  if (!active) return;
  active.audio.pause();
  try {
    active.audio.currentTime = 0;
  } catch {
    // Some browsers reject seeking before media metadata is ready.
  }
  active.resolve({ status: "cancelled" });
}

function playRecordedAudio(source: string): Promise<TtsResult> {
  if (typeof Audio === "undefined") return Promise.resolve({ status: "unavailable" });
  const audio = new Audio(source);
  audio.preload = "auto";
  return new Promise<TtsResult>((resolve) => {
    let settled = false;
    const finish = (result: TtsResult) => {
      if (settled) return;
      settled = true;
      if (activeRecordedAudio?.audio === audio) activeRecordedAudio = null;
      audio.onended = null;
      audio.onerror = null;
      resolve(result);
    };
    activeRecordedAudio = { audio, resolve: finish };
    audio.onended = () => finish({ status: "completed" });
    audio.onerror = () => finish({ status: "error" });
    try {
      void Promise.resolve(audio.play()).catch(() => finish({ status: "error" }));
    } catch {
      finish({ status: "error" });
    }
  });
}

function statusForResult(result: TtsResult) {
  if (result.status === "unavailable") setGlobalSpeechStatus("unavailable");
  else if (result.status === "error") setGlobalSpeechStatus("error");
  else setGlobalSpeechStatus("idle");
}

export async function speakLearningMoment(
  moment: LearningSpeechMoment,
  requestedMode?: ReadAloudMode,
): Promise<TtsResult> {
  const mode = requestedMode ?? getExperienceSnapshot().readAloudMode;
  const speechId = ++activeSpeechId;
  browserTts.stop();
  stopRecordedAudio();
  if (mode === "none") {
    setGlobalSpeechStatus("idle");
    return { status: "cancelled" };
  }

  if (mode === "bilingual" && moment.bilingualAudioSrc) {
    setGlobalSpeechStatus("speaking-zh");
    const recordedResult = await playRecordedAudio(moment.bilingualAudioSrc);
    if (speechId !== activeSpeechId || recordedResult.status === "cancelled") return { status: "cancelled" };
    if (recordedResult.status === "completed") {
      setGlobalSpeechStatus("idle");
      return recordedResult;
    }
  }

  if (mode === "zh" || mode === "bilingual") {
    setGlobalSpeechStatus("speaking-zh");
    const result = await browserTts.speak({
      text: moment.zh,
      lang: "zh-CN",
      rate: 0.9,
      pitch: 1.05,
    });
    if (speechId !== activeSpeechId || result.status === "cancelled") return { status: "cancelled" };
    if (result.status !== "completed") {
      statusForResult(result);
      if (mode === "zh") return result;
    }
  }

  if (mode === "en" || mode === "bilingual") {
    setGlobalSpeechStatus("speaking-en");
    const result = await browserTts.speak({
      text: moment.en,
      lang: "en-US",
      rate: 0.82,
      pitch: 1.04,
    });
    if (speechId !== activeSpeechId) return { status: "cancelled" };
    statusForResult(result);
    return result;
  }

  setGlobalSpeechStatus("idle");
  return { status: "completed" };
}

export function stopLearningSpeech() {
  activeSpeechId += 1;
  stopRecordedAudio();
  browserTts.stop();
  setGlobalSpeechStatus("idle");
}

// Pausing a recorded pair preserves its exact position, including the language gap.
export function pauseLearningSpeech() {
  if (activeRecordedAudio) { activeRecordedAudio.audio.pause(); setGlobalSpeechStatus("idle"); }
  else browserTts.pause();
}
export function resumeLearningSpeech() {
  const active = activeRecordedAudio;
  if (active) {
    setGlobalSpeechStatus("speaking-zh");
    void active.audio.play().catch(() => {
      if (activeRecordedAudio === active) active.resolve({ status: "error" });
    });
  } else browserTts.resume();
}
