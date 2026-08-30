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
  it("starts with the surface row connected to open air", () => {
    const progress = createInitialProgress(catalog, fixedRandom);
    const top = progress.board.cells.find((cell) => cell.depth === 1 && cell.column === 0)!;
    const below = progress.board.cells.find((cell) => cell.depth === 2 && cell.column === 0)!;
    assert.equal(isCellAccessible(progress.board, top), true);
    assert.equal(isCellAccessible(progress.board, below), false);
  });

  it("allows any cell touching a connected excavated tunnel", () => {
    const initial = createInitialProgress(catalog, fixedRandom);
    const first = initial.board.cells.find((cell) => cell.column === 0 && cell.depth === 1)!;
    const afterFirst = strikeCell(initial, first.id, catalog, fixedRandom).progress;
    const second = afterFirst.board.cells.find((cell) => cell.column === 0 && cell.depth === 2)!;
    const tunneled = strikeCell(afterFirst, second.id, catalog, fixedRandom).progress;
    const sideCell = tunneled.board.cells.find((cell) => cell.column === 1 && cell.depth === 2)!;
    const deeperSideCell = tunneled.board.cells.find((cell) => cell.column === 1 && cell.depth === 3)!;

    assert.equal(isCellAccessible(tunneled.board, sideCell), true);
    assert.equal(isCellAccessible(tunneled.board, deeperSideCell), false);

    const branched = strikeCell(tunneled, sideCell.id, catalog, fixedRandom).progress;
    const nextSideCell = branched.board.cells.find((cell) => cell.column === 2 && cell.depth === 2)!;
    assert.equal(isCellAccessible(branched.board, nextSideCell), true);
    assert.ok(branched.board.cells.some((cell) => cell.column === 1 && cell.depth === 1));
    assert.equal(
      branched.board.cells.find((cell) => cell.column === 1 && cell.depth === 2)?.status,
      "cleared",
    );
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
      6,
    );
    assert.equal(
      result.progress.board.cells.find((cell) => cell.id === target.id)?.status,
      "cleared",
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

  it("keeps every square fixed when a non-bottom cell becomes a hole", () => {
    const initial = createInitialProgress(catalog, fixedRandom);
    const stableNeighbor = initial.board.cells.find(
      (cell) => cell.column === 1 && cell.depth === 2,
    )!;
    const first = initial.board.cells.find((cell) => cell.column === 0 && cell.depth === 1)!;
    const progress = strikeCell(initial, first.id, catalog, fixedRandom).progress;

    assert.equal(progress.board.baseDepth, 1);
    assert.equal(progress.board.cells.find((cell) => cell.id === first.id)?.status, "cleared");
    assert.equal(
      progress.board.cells.find((cell) => (
        cell.column === stableNeighbor.column && cell.depth === stableNeighbor.depth
      ))?.id,
      stableNeighbor.id,
    );
    for (let depth = 1; depth <= 6; depth += 1) {
      assert.equal(progress.board.cells.filter((cell) => cell.depth === depth).length, 5);
    }
  });

  it("advances all five columns together only after the bottom row has a hole", () => {
    const initial = createInitialProgress(catalog, fixedRandom);
    const retainedNeighbor = initial.board.cells.find(
      (cell) => cell.column === 1 && cell.depth === 2,
    )!;
    const overflowingTop = initial.board.cells.find(
      (cell) => cell.column === 1 && cell.depth === 1,
    )!;
    let progress = initial;

    for (let depth = 1; depth <= 5; depth += 1) {
      const target = progress.board.cells.find(
        (cell) => cell.column === 0 && cell.depth === depth,
      )!;
      progress = strikeCell(progress, target.id, catalog, fixedRandom).progress;
      assert.equal(progress.board.baseDepth, 1);
    }

    const bottomTarget = progress.board.cells.find(
      (cell) => cell.column === 0 && cell.depth === 6,
    )!;
    progress = strikeCell(progress, bottomTarget.id, catalog, fixedRandom).progress;

    assert.equal(progress.board.baseDepth, 2);
    assert.equal(progress.currentDepth, 6);
    assert.equal(progress.board.cells.length, 30);
    assert.equal(progress.board.cells.some((cell) => cell.id === overflowingTop.id), false);
    assert.equal(
      progress.board.cells.find((cell) => (
        cell.column === retainedNeighbor.column && cell.depth === retainedNeighbor.depth
      ))?.id,
      retainedNeighbor.id,
    );
    for (let depth = 2; depth <= 7; depth += 1) {
      assert.equal(progress.board.cells.filter((cell) => cell.depth === depth).length, 5);
    }
    const newBottomRow = progress.board.cells.filter((cell) => cell.depth === 7);
    assert.equal(newBottomRow.length, 5);
    assert.equal(newBottomRow.every((cell) => cell.status !== "cleared"), true);
    for (let depth = 2; depth <= 6; depth += 1) {
      assert.equal(
        progress.board.cells.find((cell) => cell.column === 0 && cell.depth === depth)?.status,
        "cleared",
      );
    }
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

  it("migrates independently refilled legacy columns into fixed coordinates", () => {
    const initial = createInitialProgress(catalog, fixedRandom);
    const removedSurface = initial.board.cells.find(
      (cell) => cell.column === 0 && cell.depth === 1,
    )!;
    const legacy = {
      ...initial,
      board: {
        baseDepth: 1,
        cells: initial.board.cells.map((cell) => (
          cell.id === removedSurface.id
            ? { ...cell, id: "legacy-column-zero-depth-seven", depth: 7 }
            : cell
        )),
      },
    };

    const migrated = parseRockMineralProgress(legacy, catalog);
    assert.ok(migrated);
    assert.equal(migrated.board.baseDepth, 1);
    assert.equal(migrated.board.cells.length, 30);
    assert.equal(
      migrated.board.cells.find((cell) => cell.column === 0 && cell.depth === 1)?.status,
      "cleared",
    );
    assert.equal(migrated.board.cells.some((cell) => cell.depth === 7), false);
    for (let depth = 1; depth <= 6; depth += 1) {
      assert.equal(migrated.board.cells.filter((cell) => cell.depth === depth).length, 5);
    }
  });
});
