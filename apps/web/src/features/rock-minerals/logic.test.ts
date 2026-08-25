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

  it("moves the 5 × 6 window down after the top row is cleared", () => {
    const initial = createInitialProgress(catalog, fixedRandom);
    let progress = {
      ...initial,
      board: {
        ...initial.board,
        cells: initial.board.cells.map((cell) => (
          cell.depth === 1 ? { ...cell, mineralId: null } : cell
        )),
      },
    };
    for (const cell of progress.board.cells.filter((candidate) => candidate.depth === 1)) {
      progress = strikeCell(progress, cell.id, catalog, fixedRandom).progress;
    }
    assert.equal(progress.board.baseDepth, 2);
    assert.equal(progress.board.cells.length, 30);
    assert.equal(Math.max(...progress.board.cells.map((cell) => cell.depth)), 7);
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
