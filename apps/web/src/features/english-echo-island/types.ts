export type EchoSentence = {
  id: string;
  english: string;
  chinese: string;
  topic: {
    lesson: number;
    chinese: string;
    english: string;
  };
  audio: {
    english: string;
    chinese: string;
    sourceFile: string;
  };
};

export type EchoProgressRecord = {
  sentenceId: string;
  completionCount: number;
  lastCompletedAt: string;
};

export type EchoProgress = {
  schemaVersion: 1;
  id: string;
  catalogId: "mumu-english-echo-island-v1";
  createdAt: string;
  updatedAt: string;
  markedSentenceIds: string[];
  regularCompletionsSinceReview: number;
  totalCompletions: number;
  masteredSentenceCount: number;
  records: EchoProgressRecord[];
};

export type EchoCatalog = {
  schemaVersion: 1;
  catalogId: "mumu-english-echo-island-v1";
  title: string;
  description: string;
  source: Record<string, unknown>;
  learningRules: {
    initialPoolSize: 20;
    masteryCompletionCount: 50;
    reviewEveryRegularCompletions: 5;
    criticalHitChance: 0.15;
    criticalHitMultiplier: 5;
  };
  counts: { sentences: 1_000; audioFiles: 2_000 };
  sentences: EchoSentence[];
  progress: EchoProgress;
};

export type EchoSelectionMode = "regular" | "review";

export type EchoSelection = {
  sentence: EchoSentence;
  mode: EchoSelectionMode;
};

export type EchoCompletionResponse = {
  alreadyRecorded: boolean;
  poolChange: {
    removedSentenceId: string;
    addedSentenceId: string | null;
  } | null;
  progress: EchoProgress;
};
