import { useSyncExternalStore } from "react";
import { DEFAULT_AUDIO_PREFERENCES, parseAudioPreferences, type AudioPreferences } from "../../../../server/src/audio-preferences";
import { loadPersistentData, queuePersistentDataWrite } from "../persistent-data";
export type { AudioPreferences };
type Snapshot = { preferences: AudioPreferences; ready: boolean; saving: boolean; error: string };
let snapshot: Snapshot = { preferences: DEFAULT_AUDIO_PREFERENCES, ready: false, saving: false, error: "" };
const listeners = new Set<() => void>();
let hydration: Promise<void> | undefined;
let revision = 0;
const fetcher: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) });
function emit(patch: Partial<Snapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); }
export const getAudioSnapshot = () => snapshot;
export function subscribeAudio(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useAudioPreferences() { return useSyncExternalStore(subscribeAudio, getAudioSnapshot, getAudioSnapshot); }
export function hydrateAudioPreferences() {
  hydration ??= (async () => {
    emit({ error: "" });
    try {
      const record = await loadPersistentData({ stableId: "audio-preferences", parsePayload: parseAudioPreferences }, fetcher);
      emit({ preferences: record?.payload ?? { ...DEFAULT_AUDIO_PREFERENCES }, ready: true });
    } catch { hydration = undefined; emit({ error: "音乐设置暂时无法恢复，请重试。", ready: false }); }
  })();
  return hydration;
}
export function setAudioPreferences(patch: Partial<AudioPreferences>) {
  if (!snapshot.ready) return;
  const preferences = parseAudioPreferences({ ...snapshot.preferences, ...patch });
  if (!preferences) return;
  const current = ++revision;
  emit({ preferences, saving: true, error: "" });
  void queuePersistentDataWrite("audio-preferences", preferences, parseAudioPreferences, fetcher).then(() => {
    if (revision === current) emit({ saving: false });
  }, () => {
    if (revision === current) emit({ saving: false, error: "设置尚未保存，请重试；当前页面仍可使用。" });
  });
}
