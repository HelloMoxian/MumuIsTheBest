import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateMultiplicationHistory,
  generateMultiplicationQuestions,
  validateMultiplicationQuestion,
  type MultiplicationDifficulty,
  type StoredMultiplicationSession,
} from "./logic";

function seededRandom(seed = 37) {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

describe("multiplication question generation", () => {
  for (const difficulty of ["facts", "reverse", "advanced"] as const) {
    it(`generates answer-unique valid ${difficulty} sets across many seeds`, () => {
      for (let seed = 1; seed <= 80; seed += 1) {
        const questions = generateMultiplicationQuestions(5, difficulty, seededRandom(seed));
        assert.equal(questions.length, 5);
        assert.equal(new Set(questions.map((question) => question.answer)).size, 5);
        assert.equal(new Set(questions.map((question) => question.expression)).size, 5);
        assert.ok(questions.every((question) => (
          validateMultiplicationQuestion(question, difficulty)
        )));
      }
    });
  }

  it("keeps 0–10 facts ordered, including reversed operand possibilities", () => {
    const seenOrders = new Set<string>();
    for (let seed = 1; seed <= 120; seed += 1) {
      for (const question of generateMultiplicationQuestions(5, "facts", seededRandom(seed))) {
        const [left, right] = question.operands;
        assert.equal(question.operators[0], "×");
        assert.ok(left! >= 0 && left! <= 10);
        assert.ok(right! >= 0 && right! <= 10);
        seenOrders.add(`${left}×${right}`);
      }
    }
    const reversiblePair = [...seenOrders].some((value) => {
      const [left, right] = value.split("×");
      return left !== right && seenOrders.has(`${right}×${left}`);
    });
    assert.equal(reversiblePair, true);
  });

  it("creates reverse facts as exact divisions without zero divisors", () => {
    const questions = generateMultiplicationQuestions(5, "reverse", seededRandom(19));
    for (const question of questions) {
      const [dividend, divisor] = question.operands;
      assert.equal(question.operators[0], "÷");
      assert.ok(divisor! >= 1 && divisor! <= 10);
      assert.equal(dividend! % divisor!, 0);
      assert.ok(question.answer >= 0 && question.answer <= 10);
    }
  });

  it("mixes advanced multiplication and division while respecting bounds", () => {
    const questions = generateMultiplicationQuestions(5, "advanced", seededRandom(29));
    assert.ok(questions.some((question) => question.operators[0] === "×"));
    assert.ok(questions.some((question) => question.operators[0] === "÷"));
    for (const question of questions) {
      if (question.operators[0] === "×") {
        assert.ok(question.operands.every((operand) => operand >= 0 && operand <= 20));
        assert.ok(question.answer <= 400);
      } else {
        const [dividend, divisor] = question.operands;
        assert.ok(dividend! >= 0 && dividend! <= 100);
        assert.ok(divisor! >= 1 && divisor! <= 20);
        assert.equal(dividend! % divisor!, 0);
      }
    }
  });
});

describe("multiplication history aggregation", () => {
  it("groups sessions by count and difficulty", () => {
    const base = {
      id: "7967411f-21c9-47b8-8942-233fa30bd920",
      startedAt: "2026-07-29T08:00:00.000Z",
      completedAt: "2026-07-29T08:00:08.000Z",
      createdAt: "2026-07-29T08:00:08.000Z",
      updatedAt: "2026-07-29T08:00:08.000Z",
      questionCount: 2 as const,
      difficulty: "facts" as MultiplicationDifficulty,
      childAge: 5,
      totalDurationMs: 8_000,
      calculationDurationMs: 6_000,
      asrSessionCount: 1,
      questions: [] as StoredMultiplicationSession["questions"],
      correctCount: 2,
      accuracy: 1,
    };
    const groups = aggregateMultiplicationHistory([
      base as StoredMultiplicationSession,
      {
        ...base,
        id: "09606e4b-ee2b-43f8-b942-00f31bb14f5d",
        calculationDurationMs: 10_000,
      } as StoredMultiplicationSession,
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.sessions, 2);
    assert.equal(groups[0]!.averageCalculationDurationMs, 8_000);
    assert.equal(groups[0]!.averageQuestionDurationMs, 4_000);
  });
});
