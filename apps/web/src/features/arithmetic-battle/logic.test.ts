import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateBattleExpression,
  generateBattleQuestions,
  latestBattleCandidate,
  matchBattleAnswers,
  validateBattleQuestion,
  type BattleDifficulty,
} from "./logic";

function seededRandom(seed = 31) {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

describe("battle expression evaluation", () => {
  it("uses normal multiplication and division precedence", () => {
    assert.equal(evaluateBattleExpression([1, 2, 3, 2], ["+", "×", "÷"]), 4);
    assert.equal(evaluateBattleExpression([80, 4, 5], ["÷", "+"]), 25);
  });

  it("rejects divisions that are not exact", () => {
    assert.equal(evaluateBattleExpression([10, 3, 2], ["÷", "+"]), null);
  });
});

describe("battle question generation", () => {
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    it(`generates answer-unique valid ${difficulty} sets across many seeds`, () => {
      for (let seed = 1; seed <= 80; seed += 1) {
        const questions = generateBattleQuestions(5, difficulty, seededRandom(seed));
        assert.equal(questions.length, 5);
        assert.equal(new Set(questions.map((question) => question.answer)).size, 5);
        assert.equal(new Set(questions.map((question) => question.expression)).size, 5);
        assert.ok(questions.every((question) => validateBattleQuestion(question, difficulty)));
      }
    });
  }

  it("keeps easy questions to two/three-term carry or borrow arithmetic under 100", () => {
    const questions = generateBattleQuestions(5, "easy", seededRandom(9));
    for (const question of questions) {
      assert.ok(question.operands.length === 2 || question.operands.length === 3);
      assert.ok(question.operators.every((operator) => operator === "+" || operator === "-"));
      assert.ok(question.operands.every((operand) => operand >= 10 && operand <= 99));
      assert.ok(question.answer >= 0 && question.answer <= 100);
    }
  });

  it("requires medium questions to contain one exact multiply/divide operation", () => {
    const questions = generateBattleQuestions(5, "medium", seededRandom(14));
    assert.ok(questions.every((question) => (
      question.operators.some((operator) => operator === "×" || operator === "÷") &&
      question.answer >= 0 &&
      question.answer <= 100
    )));
  });

  it("keeps hard questions genuinely complex and under 300", () => {
    const questions = generateBattleQuestions(5, "hard", seededRandom(21));
    for (const question of questions) {
      assert.ok(question.answer >= 0 && question.answer <= 300);
      assert.ok(question.operands.some((operand) => operand >= 100));
      assert.ok(question.operands.length === 2
        ? question.operators.every((operator) => operator === "+" || operator === "-")
        : question.operators.some((operator) => operator === "×" || operator === "÷"));
      assert.equal(question.operators.some(
        (operator, index) => operator === "×" && question.operators[index - 1] === "×",
      ), false);
    }
  });
});

describe("battle voice matching", () => {
  const questions = generateBattleQuestions(5, "medium", seededRandom(42));

  it("maps one spoken answer to exactly one unresolved question", () => {
    const target = questions[2]!;
    assert.deepEqual(matchBattleAnswers(`我算出来等于${target.answer}`, questions), [target]);
  });

  it("can consume multiple unique answers from a full transcript without duplicates", () => {
    const [first, second] = questions;
    const matches = matchBattleAnswers(
      `等于${first!.answer}，后来又说等于${first!.answer}，还有等于${second!.answer}`,
      questions,
    );
    assert.deepEqual(matches, [first, second]);
  });

  it("keeps a non-matching result available for the gentle hint bubble", () => {
    const answers = new Set(questions.map((question) => question.answer));
    let outside = 301;
    while (answers.has(outside)) outside += 1;
    assert.equal(latestBattleCandidate(`等于${outside}`), outside);
    assert.deepEqual(matchBattleAnswers(`等于${outside}`, questions), []);
  });
});

describe("difficulty validation", () => {
  it("rejects deceptively simple hard questions", () => {
    const simple = { operands: [1, 1], operators: ["+" as const], answer: 2 };
    assert.equal(validateBattleQuestion(simple, "hard" satisfies BattleDifficulty), false);
  });
});
