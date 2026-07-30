import { useEffect, useSyncExternalStore } from "react";
import { browserTts, type SpeakOptions } from "./tts";

type UseTtsOptions = {
  stopOnUnmount?: boolean;
};

export function useTts(options: UseTtsOptions = {}) {
  const state = useSyncExternalStore(
    browserTts.subscribe,
    browserTts.getSnapshot,
    browserTts.getSnapshot,
  );

  useEffect(
    () => () => {
      if (options.stopOnUnmount) browserTts.stop();
    },
    [options.stopOnUnmount],
  );

  return {
    ...state,
    speak: (speechOptions: SpeakOptions) => browserTts.speak(speechOptions),
    stop: browserTts.stop,
    pause: browserTts.pause,
    resume: browserTts.resume,
    getAvailableVoices: browserTts.getAvailableVoices,
  };
}
