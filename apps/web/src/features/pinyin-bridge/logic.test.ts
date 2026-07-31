import assert from "node:assert/strict";
import test from "node:test";
import characterAsset from "../../../../../content/chinese/common-characters.v1.json";
import {
  PINYIN_GROUPS,
  PINYIN_UNITS,
  charactersForPinyinUnit,
  detectPinyinVoiceCommands,
  matchesPinyinUnit,
  movePinyinSelection,
  normalizePinyin,
  samplePinyinCharacters,
  splitHighlightedPinyin,
  stepPinyinGroup,
  type PinyinCharacter,
  type PinyinUnit,
} from "./logic";

const CHARACTERS = characterAsset.characters as PinyinCharacter[];

function unit(id: string): PinyinUnit {
  const result = PINYIN_UNITS.find((item) => item.id === id);
  assert.ok(result, `缺少拼音单元 ${id}`);
  return result;
}

test("拼音总表完整包含 23 个声母、24 个韵母和 16 个整体认读音节", () => {
  assert.deepEqual(
    PINYIN_GROUPS.map((group) => [group.id, group.units.length]),
    [["initial", 23], ["final", 24], ["whole", 16]],
  );
  assert.equal(PINYIN_UNITS.length, 63);
  assert.equal(new Set(PINYIN_UNITS.map((item) => item.id)).size, 63);
  assert.deepEqual(
    PINYIN_GROUPS[0]!.units.map((item) => item.value).slice(-5),
    ["z", "c", "s", "y", "w"],
  );
});

test("现有常用字资料能为每个拼音学习单元提供至少一个合法汉字", () => {
  for (const item of PINYIN_UNITS) {
    assert.ok(
      charactersForPinyinUnit(CHARACTERS, item).length > 0,
      `${item.id} 没有可展示汉字`,
    );
  }
});

test("声母、韵母、整体认读和 ü 省点拼写使用不同匹配语义", () => {
  assert.equal(matchesPinyinUnit("shì", unit("initial:sh")), true);
  assert.equal(matchesPinyinUnit("shì", unit("initial:s")), false);
  assert.equal(matchesPinyinUnit("hǎo", unit("final:ao")), true);
  assert.equal(matchesPinyinUnit("nǚ", unit("final:ü")), true);
  assert.equal(matchesPinyinUnit("qù", unit("final:ü")), true);
  assert.equal(matchesPinyinUnit("qù", unit("final:u")), false);
  assert.equal(matchesPinyinUnit("bù", unit("final:u")), true);
  assert.equal(matchesPinyinUnit("yuè", unit("final:üe")), true);
  assert.equal(matchesPinyinUnit("shì", unit("whole:shi")), true);
  assert.equal(matchesPinyinUnit("shí", unit("whole:shi")), true);
  assert.equal(matchesPinyinUnit("shū", unit("whole:shi")), false);
});

test("完整带调拼音只高亮当前拼音对应的原始字符", () => {
  assert.deepEqual(splitHighlightedPinyin("hǎo", unit("final:ao")), {
    before: "h",
    match: "ǎo",
    after: "",
  });
  assert.deepEqual(splitHighlightedPinyin("shì", unit("initial:sh")), {
    before: "",
    match: "sh",
    after: "ì",
  });
  assert.deepEqual(splitHighlightedPinyin("yuè", unit("final:üe")), {
    before: "y",
    match: "uè",
    after: "",
  });
  assert.equal(normalizePinyin(" NǙ! "), "nü");
});

test("随机汉字抽样不重复，并能随随机源改变", () => {
  const source = Array.from({ length: 12 }, (_, index) => index);
  let seed = 0x1234abcd;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  const first = samplePinyinCharacters(source, 6, random);
  const second = samplePinyinCharacters(source, 6, random);
  assert.equal(first.length, 6);
  assert.equal(new Set(first).size, 6);
  assert.notDeepEqual(first, second);
});

test("方向导航限制在当前分区，分区切换会循环", () => {
  assert.equal(
    movePinyinSelection("initial", "initial:b", "right", 12).id,
    "initial:p",
  );
  assert.equal(
    movePinyinSelection("initial", "initial:b", "up", 12).id,
    "initial:b",
  );
  assert.equal(
    movePinyinSelection("initial", "initial:b", "down", 12).id,
    "initial:q",
  );
  assert.equal(stepPinyinGroup("whole", 1).id, "initial");
  assert.equal(stepPinyinGroup("initial", -1).id, "whole");
});

test("语音支持连续方向、分区、详情、换批、关闭和返回首页", () => {
  assert.deepEqual(
    detectPinyinVoiceCommands("向右向右向下，详细信息"),
    [
      { kind: "move", direction: "right" },
      { kind: "move", direction: "right" },
      { kind: "move", direction: "down" },
      { kind: "action", action: "open" },
    ],
  );
  assert.deepEqual(detectPinyinVoiceCommands("切换到韵母区"), [
    { kind: "group", group: "final" },
  ]);
  assert.deepEqual(detectPinyinVoiceCommands("下一组"), [
    { kind: "group-step", step: 1 },
  ]);
  assert.deepEqual(detectPinyinVoiceCommands("换一批汉字"), [
    { kind: "action", action: "shuffle" },
  ]);
  assert.deepEqual(detectPinyinVoiceCommands("关闭卡片"), [
    { kind: "action", action: "close" },
  ]);
  assert.deepEqual(detectPinyinVoiceCommands("返回首页"), [
    { kind: "action", action: "home" },
  ]);
});
