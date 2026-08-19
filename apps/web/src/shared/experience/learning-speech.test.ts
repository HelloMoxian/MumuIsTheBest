import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arithmeticResultSpeech,
  catMouseResultSpeech,
  findNumberResultSpeech,
  numberToChinese,
  numberToEnglish,
} from "./learning-speech";

describe("bilingual learning speech semantics", () => {
  it("speaks common integers naturally in Chinese and English", () => {
    assert.equal(numberToChinese(0), "零");
    assert.equal(numberToChinese(17), "十七");
    assert.equal(numberToChinese(105), "一百零五");
    assert.equal(numberToEnglish(17), "seventeen");
    assert.equal(numberToEnglish(105), "one hundred five");
  });

  it("turns a correct arithmetic problem into a complete bilingual equation", () => {
    assert.deepEqual(arithmeticResultSpeech("4 + 3", 7), {
      zh: "四 加 三 等于 七",
      en: "four plus three equals seven",
    });
    assert.deepEqual(arithmeticResultSpeech("12 ÷ 3", 4), {
      zh: "十二 除以 三 等于 四",
      en: "twelve divided by three equals four",
    });
    assert.deepEqual(arithmeticResultSpeech("12-3", 9), {
      zh: "十二 减 三 等于 九",
      en: "twelve minus three equals nine",
    });
  });

  it("uses the find-number rules in the success narration", () => {
    assert.deepEqual(findNumberResultSpeech(73, 6), {
      zh: "找到啦！神秘数字是七十三。你用了六次提问。",
      en: "You found it! The mystery number is seventy three. You used six questions.",
    });
  });

  it("explains the picture relationship as well as the final answer", () => {
    const speech = catMouseResultSpeech({
      kind: "share-three",
      answer: 6,
      unit: "块",
      equation: "18 ÷ 3 = 6",
    });
    assert.match(speech.zh, /平均分成三份/);
    assert.match(speech.zh, /十八 除以 三 等于 六/);
    assert.match(speech.en, /Share the cheese equally into three groups/);
    assert.match(speech.en, /eighteen divided by three equals six/);
  });
});
