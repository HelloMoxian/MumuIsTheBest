import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeGradeAtReadingLine,
  equivalentKnowledgeAge,
  formatProgressPercent,
  knowledgeLightId,
} from "./logic";

describe("math knowledge tower logic", () => {
  it("creates stable light IDs", () => {
    assert.equal(knowledgeLightId("g01-001", "aware"), "g01-001:aware");
    assert.equal(knowledgeLightId("g09-059", "master"), "g09-059:master");
  });

  it("maps all 2068 lights across the exact 6-to-15-year span", () => {
    assert.equal(equivalentKnowledgeAge(0).label, "6岁0月0天");
    assert.equal(equivalentKnowledgeAge(1).label, "6岁0月1天");
    assert.equal(equivalentKnowledgeAge(2_068).label, "15岁0月0天");
  });

  it("selects the grade crossing the viewport reading line", () => {
    const bands = [
      { id: "grade-3", top: -400, bottom: -20 },
      { id: "grade-2", top: -20, bottom: 560 },
      { id: "grade-1", top: 560, bottom: 1_100 },
    ];
    assert.equal(activeGradeAtReadingLine(bands, 180), "grade-2");
    assert.equal(activeGradeAtReadingLine(bands, 900), "grade-1");
    assert.equal(activeGradeAtReadingLine([], 180), null);
  });

  it("formats small and complete progress without hiding precision", () => {
    assert.equal(formatProgressPercent(0), "0%");
    assert.equal(formatProgressPercent(0.0483), "0.05%");
    assert.equal(formatProgressPercent(42.456), "42.5%");
    assert.equal(formatProgressPercent(100), "100%");
  });
});
