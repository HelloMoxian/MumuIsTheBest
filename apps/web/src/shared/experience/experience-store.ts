import { useSyncExternalStore } from "react";
import type { InterfaceLanguageMode } from "./translations";

export type ReadAloudMode = "none" | "zh" | "en" | "bilingual";
export type GlobalSpeechStatus = "idle" | "speaking-zh" | "speaking-en" | "unavailable" | "error";

export type ExperienceSnapshot = {
  interfaceMode: InterfaceLanguageMode;
  readAloudMode: ReadAloudMode;
  speechStatus: GlobalSpeechStatus;
};

const STORAGE_KEY = "mumu:experience-preferences:v1";
const DEFAULT_SNAPSHOT: ExperienceSnapshot = {
  interfaceMode: "zh",
  readAloudMode: "bilingual",
  speechStatus: "idle",
};
const listeners = new Set<() => void>();

function isInterfaceMode(value: unknown): value is InterfaceLanguageMode {
  return value === "zh" || value === "en" || value === "bilingual";
}

function isReadAloudMode(value: unknown): value is ReadAloudMode {
  return value === "none" || value === "zh" || value === "en" || value === "bilingual";
}

function loadPreferences(): ExperienceSnapshot {
  if (typeof window === "undefined") return DEFAULT_SNAPSHOT;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as {
      interfaceMode?: unknown;
      readAloudMode?: unknown;
    } | null;
    return {
      interfaceMode: isInterfaceMode(value?.interfaceMode)
        ? value.interfaceMode
        : DEFAULT_SNAPSHOT.interfaceMode,
      readAloudMode: isReadAloudMode(value?.readAloudMode)
        ? value.readAloudMode
        : DEFAULT_SNAPSHOT.readAloudMode,
      speechStatus: "idle",
    };
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}

let snapshot = loadPreferences();

function emit(next: ExperienceSnapshot, persist: boolean) {
  snapshot = next;
  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        interfaceMode: next.interfaceMode,
        readAloudMode: next.readAloudMode,
      }));
    } catch {
      // Preference persistence is optional; the live setting remains available.
    }
  }
  listeners.forEach((listener) => listener());
}

export function getExperienceSnapshot(): ExperienceSnapshot {
  return snapshot;
}

export function setInterfaceMode(interfaceMode: InterfaceLanguageMode) {
  if (interfaceMode === snapshot.interfaceMode) return;
  emit({ ...snapshot, interfaceMode }, true);
}

export function setReadAloudMode(readAloudMode: ReadAloudMode) {
  if (readAloudMode === snapshot.readAloudMode) return;
  emit({ ...snapshot, readAloudMode, speechStatus: "idle" }, true);
}

export function setGlobalSpeechStatus(speechStatus: GlobalSpeechStatus) {
  if (speechStatus === snapshot.speechStatus) return;
  emit({ ...snapshot, speechStatus }, false);
}

export function subscribeExperience(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useExperiencePreferences(): ExperienceSnapshot {
  return useSyncExternalStore(subscribeExperience, getExperienceSnapshot, () => DEFAULT_SNAPSHOT);
}
