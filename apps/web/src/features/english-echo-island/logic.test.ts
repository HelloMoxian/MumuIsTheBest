import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completionCount,
  echoCompletionMap,
  selectNextEchoSentence,
} from "./logic";
import type { EchoCatalog, EchoProgress, EchoSentence } from "./types";

function sentence(index: number): EchoSentence {
  return {
    id: `echo-${String(index).padStart(4, "0")}`,
    english: `Sentence ${index}.`,
    chinese: `句子${index}。`,
    topic: { lesson: 1, chinese: "测试", english: "Test" },
    audio: { english: `/en/${index}.mp3`, chinese: `/zh/${index}.mp3`, sourceFile: `${index}.mp3` },
  };
}

function progress(overrides: Partial<EchoProgress> = {}): EchoProgress {
  return {
    schemaVersion: 1,
    id: "00000000-0000-4000-8000-000000000001",
    catalogId: "mumu-english-echo-island-v1",
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    markedSentenceIds: ["echo-0001", "echo-0002"],
    regularCompletionsSinceReview: 0,
    totalCompletions: 0,
    masteredSentenceCount: 0,
    records: [],
    ...overrides,
  };
}

const catalog: Pick<EchoCatalog, "sentences" | "learningRules"> = {
  sentences: [sentence(1), sentence(2), sentence(3), sentence(4)],
  learningRules: {
    initialPoolSize: 20,
    masteryCompletionCount: 50,
    reviewEveryRegularCompletions: 5,
    criticalHitChance: 0.15,
    criticalHitMultiplier: 5,
  },
};

describe("English Echo Island selection", () => {
  it("selects only from the marked focus pool during regular learning", () => {
    const selected = selectNextEchoSentence(catalog, progress(), undefined, () => 0.99);
    assert.equal(selected.mode, "regular");
    assert.equal(selected.sentence.id, "echo-0002");
  });

  it("avoids an immediate repeat when another marked sentence exists", () => {
    const selected = selectNextEchoSentence(catalog, progress(), "echo-0001", () => 0);
    assert.equal(selected.sentence.id, "echo-0002");
  });

  it("reviews a graduated unmarked sentence after five regular completions", () => {
    const selected = selectNextEchoSentence(
      catalog,
      progress({
        regularCompletionsSinceReview: 5,
        masteredSentenceCount: 1,
        records: [{
          sentenceId: "echo-0003",
          completionCount: 50,
          lastCompletedAt: "2026-08-19T00:01:00.000Z",
        }],
      }),
      undefined,
      () => 0,
    );
    assert.equal(selected.mode, "review");
    assert.equal(selected.sentence.id, "echo-0003");
  });

  it("continues the marked pool when no sentence has graduated", () => {
    const selected = selectNextEchoSentence(
      catalog,
      progress({ regularCompletionsSinceReview: 5 }),
      undefined,
      () => 0,
    );
    assert.equal(selected.mode, "regular");
    assert.equal(selected.sentence.id, "echo-0001");
  });
});

describe("English Echo Island progress helpers", () => {
  it("maps sparse completion records and treats missing sentences as zero", () => {
    const records = [{
      sentenceId: "echo-0002",
      completionCount: 12,
      lastCompletedAt: "2026-08-19T00:00:00.000Z",
    }];
    assert.equal(echoCompletionMap(records).get("echo-0002"), 12);
    assert.equal(completionCount(progress({ records }), "echo-0002"), 12);
    assert.equal(completionCount(progress({ records }), "echo-0001"), 0);
  });
});
