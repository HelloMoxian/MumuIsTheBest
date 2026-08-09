import { useEffect, useRef } from "react";

export const NUMERIC_KEYPAD_OPEN_EVENT = "mumu:numeric-keypad-open";
export const NUMERIC_KEYPAD_SUBMIT_EVENT = "mumu:numeric-keypad-submit";
export const NUMERIC_KEYPAD_MAX_DIGITS = 12;

export type NumericKeypadSubmission = {
  digits: string;
  value: number;
};

const PLACE_VALUE_LABELS = [
  "个",
  "十",
  "百",
  "千",
  "万",
  "十万",
  "百万",
  "千万",
  "亿",
  "十亿",
  "百亿",
  "千亿",
] as const;

const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const GROUP_DIGIT_UNITS = ["", "十", "百", "千"] as const;
const GROUP_UNITS = ["", "万", "亿"] as const;

export function placeValueLabel(positionFromRight: number) {
  return PLACE_VALUE_LABELS[positionFromRight] ?? `第 ${positionFromRight + 1} 位`;
}

export function appendNumericKeypadDigit(current: string, digit: number) {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) return current;
  if (current.length >= NUMERIC_KEYPAD_MAX_DIGITS) return current;
  if (current === "0") return digit === 0 ? current : String(digit);
  return current + String(digit);
}

function readFourDigitGroup(value: number, omitLeadingOne = true) {
  let output = "";
  let pendingZero = false;
  for (let position = 3; position >= 0; position -= 1) {
    const divisor = 10 ** position;
    const digit = Math.floor(value / divisor) % 10;
    if (digit === 0) {
      if (output && value % divisor !== 0) pendingZero = true;
      continue;
    }
    if (pendingZero) output += "零";
    const shouldOmitLeadingOne = omitLeadingOne && digit === 1 && position === 1 && output === "";
    if (!shouldOmitLeadingOne) output += CHINESE_DIGITS[digit];
    output += GROUP_DIGIT_UNITS[position];
    pendingZero = false;
  }
  return output;
}

export function formatChineseInteger(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 1_000_000_000_000) return "";
  if (value === 0) return "零";

  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 10_000);
    remaining = Math.floor(remaining / 10_000);
  }

  let output = "";
  let skippedGroup = false;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index] ?? 0;
    if (group === 0) {
      if (output) skippedGroup = true;
      continue;
    }
    if (output && (skippedGroup || group < 1_000)) output += "零";
    output += readFourDigitGroup(group, output === "") + GROUP_UNITS[index];
    skippedGroup = false;
  }
  return output;
}

export function openNumericKeypad() {
  window.dispatchEvent(new Event(NUMERIC_KEYPAD_OPEN_EVENT));
}

let activeReceiverCount = 0;

export function submitNumericKeypadValue(submission: NumericKeypadSubmission) {
  const hasReceiver = activeReceiverCount > 0;
  window.dispatchEvent(new CustomEvent<NumericKeypadSubmission>(
    NUMERIC_KEYPAD_SUBMIT_EVENT,
    { detail: submission },
  ));
  return hasReceiver;
}

export function useNumericKeypadSubmission(
  handler: (submission: NumericKeypadSubmission) => void,
  enabled = true,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    activeReceiverCount += 1;
    const receive = (event: Event) => {
      handlerRef.current((event as CustomEvent<NumericKeypadSubmission>).detail);
    };
    window.addEventListener(NUMERIC_KEYPAD_SUBMIT_EVENT, receive);
    return () => {
      activeReceiverCount = Math.max(0, activeReceiverCount - 1);
      window.removeEventListener(NUMERIC_KEYPAD_SUBMIT_EVENT, receive);
    };
  }, [enabled]);
}
