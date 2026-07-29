import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateHistory,
  decideTranscriptAnswer,
  extractAnswerCandidates,
  generateQuestions,
  isRestartCommand,
  isStartCommand,
  parseSpokenNumber,
  recordConfirmedWrong,
  type StoredPracticeSession,
} from "./logic";

function seededRandom(seed = 17) {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

describe("generateQuestions", () => {
  for (const operationType of ["addition", "subtraction", "mixed"] as const) {
    it(`generates unique ${operationType} questions within the 0–20 atom rules`, () => {
      const questions = generateQuestions(20, operationType, seededRandom());
      assert.equal(questions.length, 20);
      assert.equal(new Set(questions.map((question) => question.id)).size, 20);

      for (const question of questions) {
        assert.ok(question.left >= 0 && question.left <= 20);
        assert.ok(question.right >= 0 && question.right <= 20);
        assert.ok(question.answer >= 0 && question.answer <= 20);
        assert.equal(
          question.operator === "+" ? question.left + question.right : question.left - question.right,
          question.answer,
        );
      }
    });
  }

  it("includes both operators for mixed practice", () => {
    const operators = new Set(generateQuestions(5, "mixed", seededRandom()).map((question) => question.operator));
    assert.deepEqual(operators, new Set(["+", "-"]));
  });
});

describe("spoken number parsing", () => {
  for (const [input, expected] of [
    ["123", 123],
    ["０１２", 12],
    ["零", 0],
    ["十二", 12],
    ["一十二", 12],
    ["零十二", 12],
    ["二十", 20],
    ["两", 2],
  ] as const) {
    it(`parses ${input}`, () => {
      assert.equal(parseSpokenNumber(input), expected);
    });
  }

  it("rejects non-number text", () => {
    assert.equal(parseSpokenNumber("再想想"), null);
  });

  it("only extracts answers after 等于 or = and keeps their order", () => {
    assert.deepEqual(extractAnswerCandidates("我猜十四，七加八等于十四，后来等于十五"), [14, 15]);
    assert.deepEqual(extractAnswerCandidates("答案可能是 15"), []);
    assert.deepEqual(extractAnswerCandidates("8+4＝一十二"), [12]);
  });

  it("prioritizes a correct value anywhere in an incremental/full transcript", () => {
    assert.deepEqual(
      decideTranscriptAnswer("刚才等于九，现在等于十七", 17),
      { kind: "correct", answer: 17 },
    );
  });

  it("uses only the latest wrong candidate while speech is still changing", () => {
    assert.deepEqual(
      decideTranscriptAnswer("先说等于九，后来等于十二", 17),
      { kind: "wrong", answer: 12 },
    );
    assert.deepEqual(decideTranscriptAnswer("我还在想", 17), { kind: "none" });
  });
});

describe("voice commands", () => {
  it("recognizes start and restart commands", () => {
    assert.equal(isStartCommand("我们 开始！"), true);
    assert.equal(isStartCommand("START"), true);
    assert.equal(isRestartCommand("再来一局吧"), true);
    assert.equal(isRestartCommand("restart"), true);
  });
});

describe("attempt accuracy evidence", () => {
  it("keeps a confirmed wrong answer irreversible after a later correct answer", () => {
    const evidence = {
      wrongAnswers: new Set<number>(),
      hadConfirmedWrong: false,
    };

    recordConfirmedWrong(evidence, 9);
    assert.equal(evidence.hadConfirmedWrong, true);
    assert.deepEqual([...evidence.wrongAnswers], [9]);

    const firstAttemptCorrectAfterLaterSuccess = !evidence.hadConfirmedWrong;
    assert.equal(firstAttemptCorrectAfterLaterSuccess, false);
  });
});

describe("aggregateHistory", () => {
  it("groups by question count and operation type using first-answer accuracy", () => {
    const base: StoredPracticeSession = {
      id: "session-1",
      startedAt: "2026-07-29T00:00:00.000Z",
      completedAt: "2026-07-29T00:01:00.000Z",
      createdAt: "2026-07-29T00:01:00.000Z",
      updatedAt: "2026-07-29T00:01:00.000Z",
      questionCount: 5,
      operationType: "addition",
      speechType: "zh",
      childAge: 5,
      totalDurationMs: 60_000,
      calculationDurationMs: 40_000,
      questions: [],
      correctCount: 4,
      accuracy: 0.8,
    };
    const groups = aggregateHistory([
      base,
      {
        ...base,
        id: "session-2",
        completedAt: "2026-07-29T01:01:00.000Z",
        totalDurationMs: 40_000,
        calculationDurationMs: 30_000,
        correctCount: 3,
        accuracy: 0.6,
      },
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(
      {
        sessions: groups[0]?.sessions,
        totalDurationMs: groups[0]?.totalDurationMs,
        calculationDurationMs: groups[0]?.calculationDurationMs,
        averageQuestionDurationMs: groups[0]?.averageQuestionDurationMs,
        childAge: groups[0]?.childAge,
        accuracy: groups[0]?.accuracy,
      },
      {
      sessions: 2,
      totalDurationMs: 50_000,
      calculationDurationMs: 35_000,
      averageQuestionDurationMs: 7_000,
      childAge: 5,
      accuracy: 0.7,
      },
    );
  });
});
