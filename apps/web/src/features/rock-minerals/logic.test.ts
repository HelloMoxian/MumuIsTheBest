import assert from "node:assert/strict";
import { describe, it } from "node:test";
import catalogAsset from "../../../../../content/nature/rock-mineral-catalog.v1.json";
import {
  completeResearch,
  createInitialProgress,
  isCellAccessible,
  parseRockMineralProgress,
  prepareResearch,
  strikeCell,
} from "./logic";
import type { RockMineralCatalog } from "./types";

const catalog = catalogAsset as RockMineralCatalog;
const fixedRandom = () => 0.99;

describe("rock and mineral digging", () => {
  it("only allows the first uncleared cell in each column", () => {
    const progress = createInitialProgress(catalog, fixedRandom);
    const top = progress.board.cells.find((cell) => cell.depth === 1 && cell.column === 0)!;
    const below = progress.board.cells.find((cell) => cell.depth === 2 && cell.column === 0)!;
    assert.equal(isCellAccessible(progress.board, top), true);
    assert.equal(isCellAccessible(progress.board, below), false);
  });

  it("clears soil without spending hammer durability", () => {
    const progress = createInitialProgress(catalog, fixedRandom);
    const target = progress.board.cells[0];
    assert.equal(target.mineralId, null);
    const result = strikeCell(progress, target.id, catalog, fixedRandom);
    assert.equal(result.outcome, "soil");
    assert.equal(result.progress.currentHammerDurability, catalog.gameplay.hammer.durability);
    assert.equal(result.progress.currentDepth, 1);
    assert.equal(result.progress.board.cells.length, 30);
    assert.equal(
      Math.max(...result.progress.board.cells.filter((cell) => cell.column === 0).map((cell) => cell.depth)),
      7,
    );
  });

  it("uses one durability per mineral hit and collects after rarity hit count", () => {
    const progress = createInitialProgress(catalog, fixedRandom);
    const target = progress.board.cells[0];
    const mineralId = "native-gold";
    const prepared = {
      ...progress,
      board: {
        ...progress.board,
        cells: progress.board.cells.map((cell) => (
          cell.id === target.id
            ? {
                ...cell,
                mineralId,
                totalHits: 3,
                hitsRemaining: 3,
              }
            : cell
        )),
      },
    };
    const first = strikeCell(prepared, target.id, catalog, fixedRandom);
    assert.equal(first.outcome, "crack");
    assert.equal(first.progress.currentHammerDurability, 29);
    const second = strikeCell(first.progress, target.id, catalog, fixedRandom);
    assert.equal(second.outcome, "crack");
    const third = strikeCell(second.progress, target.id, catalog, fixedRandom);
    assert.equal(third.outcome, "mineral");
    assert.equal(third.progress.currentHammerDurability, 27);
    assert.equal(third.progress.inventory[mineralId], 1);
    assert.deepEqual(third.progress.discoveredIds, [mineralId]);
  });

  it("can keep moving one column down without clearing the other columns", () => {
    const initial = createInitialProgress(catalog, fixedRandom);
    const first = initial.board.cells.find((cell) => cell.column === 0 && cell.depth === 1)!;
    let progress = strikeCell(initial, first.id, catalog, fixedRandom).progress;

    assert.deepEqual(
      progress.board.cells.filter((cell) => cell.column === 0).map((cell) => cell.depth).sort((a, b) => a - b),
      [2, 3, 4, 5, 6, 7],
    );
    assert.deepEqual(
      progress.board.cells.filter((cell) => cell.column === 1).map((cell) => cell.depth).sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6],
    );
    assert.equal(progress.board.baseDepth, 1);

    const second = progress.board.cells.find((cell) => cell.column === 0 && cell.depth === 2)!;
    assert.equal(isCellAccessible(progress.board, second), true);
    progress = strikeCell(progress, second.id, catalog, fixedRandom).progress;

    assert.deepEqual(
      progress.board.cells.filter((cell) => cell.column === 0).map((cell) => cell.depth).sort((a, b) => a - b),
      [3, 4, 5, 6, 7, 8],
    );
    assert.equal(progress.currentDepth, 2);
    assert.equal(progress.board.cells.length, 30);
  });
});

describe("rock and mineral research", () => {
  it("prepares one stable random attribute then consumes one specimen on completion", () => {
    const initial = createInitialProgress(catalog, fixedRandom);
    const progress = {
      ...initial,
      inventory: { quartz: 2 },
      discoveredIds: ["quartz"],
    };
    const prepared = prepareResearch(
      progress,
      "quartz",
      "2a8280f9-8056-4a7c-a372-5ab0c0d80f07",
      () => 0,
    );
    assert.equal(prepared.pendingResearch?.attributeKey, "name");
    const completed = completeResearch(prepared);
    assert.equal(completed.inventory.quartz, 1);
    assert.deepEqual(completed.unlockedAttributes.quartz, ["name"]);
    assert.equal(completed.pendingResearch, null);
    assert.ok(parseRockMineralProgress(completed, catalog));
  });

  it("rejects malformed or unknown persisted mineral ids", () => {
    const initial = createInitialProgress(catalog, fixedRandom);
    assert.equal(
      parseRockMineralProgress(
        { ...initial, discoveredIds: ["not-in-the-catalog"] },
        catalog,
      ),
      undefined,
    );
  });
});
