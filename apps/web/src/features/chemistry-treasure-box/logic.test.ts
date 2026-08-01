import assert from "node:assert/strict";
import test from "node:test";
import { ELEMENTS } from "../periodic-table/elements.generated";
import { REACTION_COMPOUNDS } from "../reaction-furnace/compound-library";
import { consumeAtomCounts } from "../reaction-furnace/logic";
import {
  addTreasureAtom,
  atomCountsKey,
  buildTreasureBoxLibrary,
  findTreasureBoxMatch,
  TREASURE_BOX_ELEMENT_LIMIT,
} from "./logic";

const allowedSymbols = new Set(
  ELEMENTS.slice(0, TREASURE_BOX_ELEMENT_LIMIT).map((element) => element.symbol),
);
const library = buildTreasureBoxLibrary(REACTION_COMPOUNDS, allowedSymbols);

test("百宝箱只保留前九十号元素可组成的多原子代表物质", () => {
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

  const firstMatch = findTreasureBoxMatch({ O: 2 }, library, new Set());
  assert.equal(firstMatch?.id, oxygen.id);
  const afterOxygen = consumeAtomCounts({ O: 2 }, oxygen.atomCounts);
  assert.deepEqual(afterOxygen, {});

  const secondMatch = findTreasureBoxMatch({ O: 3 }, library, new Set([oxygen.id]));
  assert.equal(secondMatch?.id, ozone.id);
  assert.equal(
    findTreasureBoxMatch({ O: 2 }, library, new Set([oxygen.id])),
    undefined,
  );
});

test("恰好投入水的原子时优先组成水，而不是先消耗氢气", () => {
  const water = library.find((compound) => compound.formula === "H₂O")!;
  let pool = {};
  pool = addTreasureAtom(pool, "H");
  pool = addTreasureAtom(pool, "H");
  pool = addTreasureAtom(pool, "O");
  assert.equal(findTreasureBoxMatch(pool, library, new Set())?.id, water.id);
});
