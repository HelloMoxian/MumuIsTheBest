import type {
  EchoCatalog,
  EchoProgress,
  EchoProgressRecord,
  EchoSelection,
  EchoSentence,
} from "./types";

export function echoCompletionMap(records: readonly EchoProgressRecord[]) {
  return new Map(records.map((record) => [record.sentenceId, record.completionCount]));
}

function withoutImmediateRepeat(items: readonly EchoSentence[], previousSentenceId?: string) {
  if (items.length <= 1 || !previousSentenceId) return [...items];
  const alternatives = items.filter((sentence) => sentence.id !== previousSentenceId);
  return alternatives.length ? alternatives : [...items];
}

function randomItem<T>(items: readonly T[], random: () => number) {
  const index = Math.min(items.length - 1, Math.floor(Math.max(0, random()) * items.length));
  return items[index]!;
}

export function selectNextEchoSentence(
  catalog: Pick<EchoCatalog, "sentences" | "learningRules">,
  progress: EchoProgress,
  previousSentenceId?: string,
  random: () => number = Math.random,
): EchoSelection {
  const counts = echoCompletionMap(progress.records);
  const marked = new Set(progress.markedSentenceIds);
  const reviewCandidates = catalog.sentences.filter(
    (sentence) =>
      !marked.has(sentence.id) &&
      (counts.get(sentence.id) ?? 0) >= catalog.learningRules.masteryCompletionCount,
  );
  if (
    progress.regularCompletionsSinceReview >=
      catalog.learningRules.reviewEveryRegularCompletions &&
    reviewCandidates.length > 0
  ) {
    return {
      sentence: randomItem(withoutImmediateRepeat(reviewCandidates, previousSentenceId), random),
      mode: "review",
    };
  }

  const activeCandidates = catalog.sentences.filter((sentence) => marked.has(sentence.id));
  const candidates = activeCandidates.length
    ? activeCandidates
    : [...catalog.sentences].sort(
        (left, right) => (counts.get(left.id) ?? 0) - (counts.get(right.id) ?? 0),
      ).slice(0, 20);
  return {
    sentence: randomItem(withoutImmediateRepeat(candidates, previousSentenceId), random),
    mode: "regular",
  };
}

export function mergeEchoProgress(catalog: EchoCatalog, progress: EchoProgress): EchoCatalog {
  return { ...catalog, progress };
}

export function completionCount(progress: EchoProgress, sentenceId: string) {
  return progress.records.find((record) => record.sentenceId === sentenceId)?.completionCount ?? 0;
}
