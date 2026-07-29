import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyGuess,
  approximateQuestionsRemaining,
  detectVoiceGameCommand,
  generateSecret,
  parseGuessQuery,
  parseLargeSpokenNumber,
  queryLabel,
  rangeMidpoint,
  rangeSize,
  type CandidateRange,
  type GuessQuery,
} from "./logic";

describe("large spoken number parsing", () => {
  const examples = new Map<string, number>([
    ["0", 0],
    ["１２３４", 1_234],
    ["零", 0],
    ["一二三", 123],
    ["十二", 12],
    ["一十二", 12],
    ["一百零三", 103],
    ["两千零五", 2_005],
    ["一万", 10_000],
    ["一万零五百", 10_500],
    ["三万四千五百六十七", 34_567],
    ["十万", 100_000],
  ]);

  for (const [spoken, expected] of examples) {
    it(`parses ${spoken}`, () => {
      assert.equal(parseLargeSpokenNumber(spoken), expected);
    });
  }

  it("rejects unrelated words and malformed repeated ten-thousands", () => {
    assert.equal(parseLargeSpokenNumber("木木"), null);
    assert.equal(parseLargeSpokenNumber("一万二万"), null);
  });
});

describe("voice game commands and questions", () => {
  it("recognizes start, end and next-round commands", () => {
    assert.equal(detectVoiceGameCommand("开始一局"), "start");
    assert.equal(detectVoiceGameCommand("结束游戏"), "end");
    assert.equal(detectVoiceGameCommand("下一局"), "next");
    assert.equal(detectVoiceGameCommand("restart"), "next");
    assert.equal(detectVoiceGameCommand("小于五百吗"), null);
  });

  it("parses exact, strict and inclusive comparison questions", () => {
    assert.deepEqual(parseGuessQuery("是500吗"), {
      kind: "exact",
      value: 500,
      rawText: "是500吗",
    });
    assert.equal(parseGuessQuery("小于八百吗")?.kind, "less-than");
    assert.equal(parseGuessQuery("比三百大吗")?.kind, "greater-than");
    assert.equal(parseGuessQuery("不超过一万吗")?.kind, "at-most");
    assert.equal(parseGuessQuery("至少两千吗")?.kind, "at-least");
    assert.equal(parseGuessQuery("这里没有数字"), null);
  });

  it("formats the question relationship for visible replay", () => {
    assert.equal(queryLabel({ kind: "exact", value: 500 }), "是 500 吗？");
    assert.equal(queryLabel({ kind: "less-than", value: 800 }), "小于 800 吗？");
    assert.equal(queryLabel({ kind: "at-least", value: 1_000 }), "至少是 1,000 吗？");
  });
});

describe("candidate range narrowing", () => {
  const range = { minimum: 0, maximum: 1_000 };
  const query = (kind: GuessQuery["kind"], value: number): GuessQuery => ({
    kind,
    value,
    rawText: "",
  });

  it("uses an exact guess to reveal higher, lower or solved", () => {
    const higher = applyGuess(range, 731, query("exact", 500));
    assert.deepEqual(higher.after, { minimum: 501, maximum: 1_000 });
    assert.equal(higher.eliminatedCount, 501);
    assert.equal(higher.eliminated?.side, "left");
    assert.match(higher.responseText, /比 500 大/);

    const lower = applyGuess(range, 231, query("exact", 500));
    assert.deepEqual(lower.after, { minimum: 0, maximum: 499 });
    assert.equal(lower.eliminatedCount, 501);
    assert.equal(lower.eliminated?.side, "right");

    const solved = applyGuess(range, 500, query("exact", 500));
    assert.equal(solved.solved, true);
    assert.deepEqual(solved.after, { minimum: 500, maximum: 500 });
    assert.equal(solved.eliminatedCount, 1_000);
  });

  it("applies strict less-than and greater-than boundaries without off-by-one errors", () => {
    const lessYes = applyGuess(range, 731, query("less-than", 800));
    assert.deepEqual(lessYes.after, { minimum: 0, maximum: 799 });
    assert.equal(lessYes.eliminatedCount, 201);

    const lessNo = applyGuess(range, 800, query("less-than", 800));
    assert.deepEqual(lessNo.after, { minimum: 800, maximum: 1_000 });
    assert.equal(lessNo.eliminatedCount, 800);

    const greaterYes = applyGuess(range, 731, query("greater-than", 500));
    assert.deepEqual(greaterYes.after, { minimum: 501, maximum: 1_000 });

    const greaterNo = applyGuess(range, 500, query("greater-than", 500));
    assert.deepEqual(greaterNo.after, { minimum: 0, maximum: 500 });
  });

  it("applies inclusive at-most and at-least boundaries", () => {
    assert.deepEqual(
      applyGuess(range, 800, query("at-most", 800)).after,
      { minimum: 0, maximum: 800 },
    );
    assert.deepEqual(
      applyGuess(range, 801, query("at-most", 800)).after,
      { minimum: 801, maximum: 1_000 },
    );
    assert.deepEqual(
      applyGuess(range, 200, query("at-least", 200)).after,
      { minimum: 200, maximum: 1_000 },
    );
    assert.deepEqual(
      applyGuess(range, 199, query("at-least", 200)).after,
      { minimum: 0, maximum: 199 },
    );
  });

  it("records harmless repeated or outside questions with zero new exclusions", () => {
    const narrowed = { minimum: 500, maximum: 700 };
    const outcome = applyGuess(narrowed, 620, query("less-than", 900));
    assert.deepEqual(outcome.after, narrowed);
    assert.equal(outcome.eliminatedCount, 0);
    assert.equal(outcome.eliminated, null);
  });

  it("keeps the secret inside the range across a long comparison sequence", () => {
    let current = { minimum: 0, maximum: 100_000 };
    const secret = 73_421;
    const questions: GuessQuery[] = [
      query("exact", 50_000),
      query("less-than", 80_000),
      query("greater-than", 70_000),
      query("at-most", 75_000),
      query("at-least", 73_000),
      query("exact", 73_421),
    ];
    for (const question of questions) {
      const outcome = applyGuess(current, secret, question);
      current = outcome.after;
      assert.ok(secret >= current.minimum && secret <= current.maximum);
      assert.ok(outcome.eliminatedCount >= 0);
    }
    assert.deepEqual(current, { minimum: secret, maximum: secret });
  });

  it("preserves the secret and exact counts for every 0—100 boundary combination", () => {
    const kinds: GuessQuery["kind"][] = [
      "exact",
      "less-than",
      "greater-than",
      "at-most",
      "at-least",
    ];
    for (let secret = 0; secret <= 100; secret += 1) {
      for (let value = 0; value <= 100; value += 1) {
        for (const kind of kinds) {
          const before = { minimum: 0, maximum: 100 };
          const outcome = applyGuess(before, secret, query(kind, value));
          assert.ok(secret >= outcome.after.minimum && secret <= outcome.after.maximum);
          assert.equal(
            outcome.eliminatedCount + outcome.remainingCount,
            rangeSize(before),
          );
        }
      }
    }
  });

  it("finds representative targets in all four ranges by repeatedly asking the midpoint", () => {
    for (const maximum of [100, 1_000, 10_000, 100_000] as const) {
      for (const secret of [0, 1, Math.floor(maximum / 2), maximum - 1, maximum]) {
        let current: CandidateRange = { minimum: 0, maximum };
        let solved = false;
        for (let step = 0; step < 20; step += 1) {
          const outcome = applyGuess(
            current,
            secret,
            query("exact", rangeMidpoint(current)),
          );
          current = outcome.after;
          if (outcome.solved) {
            solved = true;
            break;
          }
        }
        assert.equal(solved, true, `failed to find ${secret} in 0—${maximum}`);
      }
    }
  });
});

describe("range helpers", () => {
  it("includes both endpoints in size, midpoint and guidance", () => {
    assert.equal(rangeSize({ minimum: 0, maximum: 100 }), 101);
    assert.equal(rangeMidpoint({ minimum: 0, maximum: 100 }), 50);
    assert.equal(approximateQuestionsRemaining({ minimum: 0, maximum: 100 }), 7);
    assert.equal(approximateQuestionsRemaining({ minimum: 42, maximum: 42 }), 0);
  });

  it("generates both inclusive random boundaries", () => {
    assert.equal(generateSecret(100, () => 0), 0);
    assert.equal(generateSecret(100, () => 1), 100);
  });
});
