import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NUMERIC_KEYPAD_MAX_DIGITS,
  appendNumericKeypadDigit,
  formatChineseInteger,
  placeValueLabel,
} from "./numeric-keypad";

describe("numeric keypad helpers", () => {
  it("appends digits in place-value order and normalizes leading zero", () => {
    let value = "";
    value = appendNumericKeypadDigit(value, 1);
    value = appendNumericKeypadDigit(value, 2);
    value = appendNumericKeypadDigit(value, 3);
    assert.equal(value, "123");
    assert.equal(appendNumericKeypadDigit("0", 5), "5");
    assert.equal(appendNumericKeypadDigit("9".repeat(NUMERIC_KEYPAD_MAX_DIGITS), 1).length, NUMERIC_KEYPAD_MAX_DIGITS);
  });

  it("labels every digit from ones through hundred billions", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 8, 11].map(placeValueLabel),
      ["个", "十", "百", "千", "万", "亿", "千亿"],
    );
  });

  it("reads representative child-facing integers in Chinese", () => {
    assert.equal(formatChineseInteger(0), "零");
    assert.equal(formatChineseInteger(12), "十二");
    assert.equal(formatChineseInteger(123), "一百二十三");
    assert.equal(formatChineseInteger(10_005), "一万零五");
    assert.equal(formatChineseInteger(10_010), "一万零一十");
    assert.equal(formatChineseInteger(100_000), "十万");
    assert.equal(formatChineseInteger(100_000_001), "一亿零一");
  });
});
