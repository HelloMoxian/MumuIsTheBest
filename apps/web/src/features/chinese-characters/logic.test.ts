import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectCharacterVoiceCommand,
  mergeProgressRecord,
  poolSizeFromPath,
  selectAdaptiveCharacters,
  summarizeRound,
  type CharacterProgressRecord,
  type CommonCharacter,
} from "./logic";

function character(rank: number): CommonCharacter {
  return {
    rank,
    character: String.fromCodePoint(0x4e00 + rank),
    pinyin: "mù",
    radical: "木",
    strokes: 4,
    standardNumber: String(rank).padStart(4, "0"),
    meaning: "测试释义。",
    words: ["测试"],
    sentence: "这是测试句子。",
    idioms: [],
  };
}

function progress(
  item: CommonCharacter,
  knownCount: number,
  notKnownCount: number,
  lastStudiedAt = "2026-07-01T00:00:00.000Z",
): CharacterProgressRecord {
  return {
    id: `00000000-0000-4000-8000-${String(item.rank).padStart(12, "0")}`,
    character: item.character,
    rank: item.rank,
    studiedCount: knownCount + notKnownCount,
    knownCount,
    notKnownCount,
    lastStudiedAt,
    lastKnownAt: knownCount ? lastStudiedAt : null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: lastStudiedAt,
  };
}

describe("common character voice commands", () => {
  it("recognizes the complete hands-free command set", () => {
    assert.equal(detectCharacterVoiceCommand("我会了！"), "known");
    assert.equal(detectCharacterVoiceCommand("下一个字"), "next");
    assert.equal(detectCharacterVoiceCommand("看看拼音"), "reveal");
    assert.equal(detectCharacterVoiceCommand("打开文字清单"), "list");
    assert.equal(detectCharacterVoiceCommand("返回"), "back");
    assert.equal(detectCharacterVoiceCommand("开始练习"), "start");
    assert.equal(detectCharacterVoiceCommand("结束一局"), "end");
    assert.equal(detectCharacterVoiceCommand("再来一局"), "restart");
    assert.equal(detectCharacterVoiceCommand("木木今天很努力"), null);
  });
});

describe("adaptive character selection", () => {
  it("mixes weak, new and mastered characters without duplication", () => {
    const pool = Array.from({ length: 14 }, (_, index) => character(index + 1));
    const records = [
      progress(pool[0]!, 0, 3),
      progress(pool[1]!, 1, 2),
      progress(pool[2]!, 0, 1),
      progress(pool[3]!, 3, 0),
      progress(pool[4]!, 2, 0),
    ];
    const selected = selectAdaptiveCharacters(
      pool,
      records,
      5,
      () => 0.42,
      Date.parse("2026-07-29T00:00:00.000Z"),
    );
    assert.equal(selected.length, 5);
    assert.equal(new Set(selected.map((item) => item.character)).size, 5);
    assert.ok(selected.some((item) => [pool[0], pool[1], pool[2]].includes(item)));
    assert.ok(selected.some((item) => item.rank >= 6));
    assert.ok(selected.some((item) => [pool[3], pool[4]].includes(item)));
  });

  it("fills a round entirely from fresh characters on first use", () => {
    const pool = Array.from({ length: 20 }, (_, index) => character(index + 1));
    const selected = selectAdaptiveCharacters(pool, [], 10, () => 0.25);
    assert.equal(selected.length, 10);
    assert.equal(new Set(selected.map((item) => item.character)).size, 10);
  });
});

describe("common character progress helpers", () => {
  it("replaces one updated record and keeps frequency ordering", () => {
    const first = character(1);
    const second = character(2);
    const records = [progress(first, 0, 1), progress(second, 1, 0)];
    const updated = progress(first, 1, 1, "2026-07-29T00:00:00.000Z");
    assert.deepEqual(
      mergeProgressRecord(records, updated).map((record) => [
        record.rank,
        record.knownCount,
        record.notKnownCount,
      ]),
      [[1, 1, 1], [2, 1, 0]],
    );
  });

  it("summarizes learned and review items without calling either wrong", () => {
    const first = character(1);
    const second = character(2);
    assert.deepEqual(
      summarizeRound([
        { character: first, known: true, studiedAt: "2026-07-29T00:00:00.000Z" },
        { character: second, known: false, studiedAt: "2026-07-29T00:01:00.000Z" },
      ]),
      { studiedCount: 2, knownCount: 1, reviewCount: 1 },
    );
  });

  it("supports every configured pool route and falls back safely", () => {
    assert.equal(poolSizeFromPath("/chinese/common-characters/500"), 500);
    assert.equal(poolSizeFromPath("/chinese/common-characters/2000"), 2_000);
    assert.equal(poolSizeFromPath("/chinese/common-characters/2500"), 2_500);
    assert.equal(poolSizeFromPath("/chinese/common-characters/nope"), 500);
  });
});
