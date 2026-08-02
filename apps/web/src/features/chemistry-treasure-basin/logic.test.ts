import assert from "node:assert/strict";
import test from "node:test";
import { ELEMENTS } from "../periodic-table/elements.generated";
import { REACTION_COMPOUNDS } from "../reaction-furnace/compound-library";
import { consumeAtomCounts } from "../reaction-furnace/logic";
import {
  addTreasureBasinAtom,
  atomCountsKey,
  buildTreasureBasinLibrary,
  canAddTreasureBasinElementBatch,
  findTreasureBasinMatch,
  indexTreasureBasinDiscoveries,
  TREASURE_BASIN_ELEMENT_LIMIT,
  TREASURE_BASIN_FREE_ATOM_LIMIT,
  treasureBasinAtomTotal,
  treasureBasinElementBatchSize,
} from "./logic";

const allowedSymbols = new Set(
  ELEMENTS.slice(0, TREASURE_BASIN_ELEMENT_LIMIT).map((element) => element.symbol),
);
const library = buildTreasureBasinLibrary(REACTION_COMPOUNDS, allowedSymbols);

test("聚宝盆只保留前九十号元素可组成的多原子代表物质", () => {
  assert.ok(library.length > 250);
  assert.equal(
    new Set(library.map((compound) => atomCountsKey(compound.atomCounts))).size,
    library.length,
  );
  assert.ok(library.every((compound) => (
    compound.totalAtoms >= 2
    && Object.keys(compound.atomCounts).every((symbol) => allowedSymbols.has(symbol))
  )));
  assert.ok(!library.some((compound) => compound.totalAtoms === 1));
});

test("氧气生成一次后，三个新氧原子可以生成臭氧", () => {
  const oxygen = library.find((compound) => compound.formula === "O₂")!;
  const ozone = library.find((compound) => compound.formula === "O₃")!;
  assert.ok(oxygen);
  assert.ok(ozone);

  const firstMatch = findTreasureBasinMatch({ O: 2 }, library, new Set());
  assert.equal(firstMatch?.id, oxygen.id);
  const afterOxygen = consumeAtomCounts({ O: 2 }, oxygen.atomCounts);
  assert.deepEqual(afterOxygen, {});

  const secondMatch = findTreasureBasinMatch({ O: 3 }, library, new Set([oxygen.id]));
  assert.equal(secondMatch?.id, ozone.id);
  assert.equal(
    findTreasureBasinMatch({ O: 2 }, library, new Set([oxygen.id])),
    undefined,
  );
});

test("恰好投入水的原子时优先组成水，而不是先消耗氢气", () => {
  const water = library.find((compound) => compound.formula === "H₂O")!;
  let pool = {};
  pool = addTreasureBasinAtom(pool, "H");
  pool = addTreasureBasinAtom(pool, "H");
  pool = addTreasureBasinAtom(pool, "O");
  assert.equal(findTreasureBasinMatch(pool, library, new Set())?.id, water.id);
});

test("已合成物质按所含元素建立索引，移除后可以重新生成", () => {
  const oxygen = library.find((compound) => compound.formula === "O₂")!;
  const ozone = library.find((compound) => compound.formula === "O₃")!;
  const water = library.find((compound) => compound.formula === "H₂O")!;
  const discoveries = [ozone, oxygen, water];
  const discoveryIndex = indexTreasureBasinDiscoveries(discoveries);

  assert.deepEqual(discoveryIndex.O, discoveries);
  assert.deepEqual(discoveryIndex.H, [water]);
  assert.equal(discoveryIndex.C, undefined);

  const completedIds = new Set(discoveries.map((compound) => compound.id));
  completedIds.delete(oxygen.id);
  assert.equal(
    findTreasureBasinMatch({ O: 2 }, library, completedIds)?.id,
    oxygen.id,
  );
});

test("氢和碳每次投五个，氧每次投三个，其他元素仍投一个", () => {
  assert.equal(treasureBasinElementBatchSize("H"), 5);
  assert.equal(treasureBasinElementBatchSize("C"), 5);
  assert.equal(treasureBasinElementBatchSize("O"), 3);
  assert.equal(treasureBasinElementBatchSize("Na"), 1);

  let pool = addTreasureBasinAtom({}, "H", treasureBasinElementBatchSize("H"));
  pool = addTreasureBasinAtom(pool, "C", treasureBasinElementBatchSize("C"));
  pool = addTreasureBasinAtom(pool, "O", treasureBasinElementBatchSize("O"));
  pool = addTreasureBasinAtom(pool, "Na", treasureBasinElementBatchSize("Na"));
  assert.deepEqual(pool, { H: 5, C: 5, O: 3, Na: 1 });
  assert.equal(treasureBasinAtomTotal(pool), 14);
  assert.equal(TREASURE_BASIN_FREE_ATOM_LIMIT, 240);

  assert.equal(canAddTreasureBasinElementBatch({ He: 235 }, "H"), true);
  assert.equal(canAddTreasureBasinElementBatch({ He: 236 }, "H"), false);
  assert.equal(canAddTreasureBasinElementBatch({ He: 237 }, "O"), true);
  assert.equal(canAddTreasureBasinElementBatch({ He: 238 }, "O"), false);
  assert.equal(canAddTreasureBasinElementBatch({ He: 239 }, "Na"), true);
  assert.equal(canAddTreasureBasinElementBatch({ He: 240 }, "Na"), false);

  const ozone = library.find((compound) => compound.formula === "O₃")!;
  const oxygen = library.find((compound) => compound.formula === "O₂")!;
  let oxygenPool = addTreasureBasinAtom({}, "O", treasureBasinElementBatchSize("O"));
  assert.equal(findTreasureBasinMatch(oxygenPool, library, new Set())?.id, ozone.id);
  oxygenPool = consumeAtomCounts(oxygenPool, ozone.atomCounts);
  oxygenPool = addTreasureBasinAtom(oxygenPool, "O", treasureBasinElementBatchSize("O"));
  assert.equal(
    findTreasureBasinMatch(oxygenPool, library, new Set([ozone.id]))?.id,
    oxygen.id,
  );
});
