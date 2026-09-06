import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendEchoSelectionHistory,
  completionCount,
  ECHO_SELECTION_HISTORY_LIMIT,
  echoCompletionMap,
  selectNextEchoSentence,
  takePreviousEchoSelection,
} from "./logic";
import type {
  EchoCatalog,
  EchoProgress,
  EchoSelection,
  EchoSentence,
} from "./types";

function sentence(index: number): EchoSentence {
  return {
    id: `echo-${String(index).padStart(4, "0")}`,
    english: `Sentence ${index}.`,
    chinese: `句子${index}。`,
    topic: { lesson: 1, chinese: "测试", english: "Test" },
    audio: { english: `/en/${index}.mp3`, chinese: `/zh/${index}.mp3`, sourceFile: `${index}.mp3` },
  };
}

function selection(index: number): EchoSelection {
  return { sentence: sentence(index), mode: "regular" };
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

describe("English Echo Island previous sentence history", () => {
  it("returns the most recent sentence and removes it from the history", () => {
    const history = appendEchoSelectionHistory(
      appendEchoSelectionHistory([], selection(1)),
      selection(2),
    );

    const previous = takePreviousEchoSelection(history);

    assert.equal(previous.selection?.sentence.id, "echo-0002");
    assert.deepEqual(
      previous.remainingHistory.map((item) => item.sentence.id),
      ["echo-0001"],
    );
  });

  it("keeps only the most recent one hundred sentences and handles an empty history", () => {
    let history: EchoSelection[] = [];
    for (let index = 1; index <= ECHO_SELECTION_HISTORY_LIMIT + 1; index += 1) {
      history = appendEchoSelectionHistory(history, selection(index));
    }

    assert.equal(history.length, ECHO_SELECTION_HISTORY_LIMIT);
    assert.equal(history[0]?.sentence.id, "echo-0002");
    assert.deepEqual(takePreviousEchoSelection([]), {
      selection: null,
      remainingHistory: [],
    });
  });
});
