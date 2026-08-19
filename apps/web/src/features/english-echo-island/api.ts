import type {
  EchoCatalog,
  EchoCompletionResponse,
  EchoProgress,
  EchoSelectionMode,
} from "./types";

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(body?.message ?? "英语回声岛暂时没有回应，请稍后再试。");
  return body as T;
}

export function loadEchoIsland(signal?: AbortSignal) {
  return requestJson<EchoCatalog>("/api/english/echo-island", { signal });
}

export function recordEchoCompletion(input: {
  eventId: string;
  sentenceId: string;
  mode: EchoSelectionMode;
  completedAt: string;
}) {
  return requestJson<EchoCompletionResponse>("/api/english/echo-island/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function setEchoSentenceMarked(sentenceId: string, marked: boolean) {
  return requestJson<{
    replacedSentenceId: string | null;
    fallbackSentenceId: string | null;
    progress: EchoProgress;
  }>("/api/english/echo-island/marks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sentenceId, marked }),
  });
}

export function clearEchoProgress() {
  return requestJson<{ progress: EchoProgress }>("/api/english/echo-island/progress/clear", {
    method: "POST",
  });
}
