import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PUZZLE_KINDS,
  generateCatMousePuzzle,
  puzzleSignature,
  validatePuzzle,
} from "./logic";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("cat mouse puzzle generation", () => {
  it("generates every formula type with positive integer answers inside 0—200", () => {
    for (const kind of PUZZLE_KINDS) {
      for (let seed = 1; seed <= 300; seed += 1) {
        const puzzle = generateCatMousePuzzle(seededRandom(seed), kind);
        assert.equal(validatePuzzle(puzzle), true, `${kind} seed ${seed}`);
        assert.equal(Number.isInteger(puzzle.answer), true);
        assert.ok(puzzle.answer > 0 && puzzle.answer <= 200);
        assert.ok(Object.values(puzzle.numbers).every((value) => (
          Number.isInteger(value) && value >= 0 && value <= 200
        )));
        assert.ok(puzzle.givens.every((given) => (
          Number.isInteger(given.value) && given.value >= 0 && given.value <= 200
        )));
      }
    }
  });

  it("keeps all divisions exact and limits divisors to two or three", () => {
    for (const kind of ["double-plus", "triple-plus", "share-two", "share-three", "double-and-single"] as const) {
      for (let seed = 5; seed < 105; seed += 1) {
        const puzzle = generateCatMousePuzzle(seededRandom(seed), kind);
        assert.ok(puzzle.divisor === 2 || puzzle.divisor === 3);
        if (kind === "share-two" || kind === "share-three") {
          assert.equal(puzzle.numbers.total % puzzle.divisor, 0);
        }
        if (kind === "double-and-single") {
          assert.equal(puzzle.numbers.total % 3, 0);
        }
      }
    }
  });

  it("builds the sample-style sum and difference system correctly", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const puzzle = generateCatMousePuzzle(seededRandom(seed), "sum-difference");
      const { objectHeight, difference, total } = puzzle.numbers;
      assert.equal(objectHeight - puzzle.answer, difference);
      assert.equal(objectHeight + puzzle.answer, total);
      assert.equal((total - difference) / 2, puzzle.answer);
      assert.deepEqual(puzzle.equations, [
        `a - x = ${difference}`,
        `a + x = ${total}`,
      ]);
    }
  });

  it("varies values, backgrounds, poses and layout variants between rounds", () => {
    const random = seededRandom(20260807);
    const puzzles = Array.from({ length: 120 }, () => generateCatMousePuzzle(random));
    const signatures = new Set(puzzles.map(puzzleSignature));
    const backgrounds = new Set(puzzles.map((puzzle) => puzzle.visual.backgroundId));
    const layouts = new Set(puzzles.map((puzzle) => puzzle.visual.layoutVariant));
    const kinds = new Set(puzzles.map((puzzle) => puzzle.kind));
    assert.ok(signatures.size > 100);
    assert.equal(backgrounds.size, 8);
    assert.equal(layouts.size, 4);
    assert.equal(kinds.size, PUZZLE_KINDS.length);
  });
});
