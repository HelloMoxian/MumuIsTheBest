/** Explicit audio ownership; no DOM scanning or microphone interception. */
const listeners = new Set<() => void>();
const microphones = new Set<symbol>();
const creatives = new Set<symbol>();
let musicActive = false;
export const audioFocus = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  isMusicActive: () => musicActive,
  isMicrophoneActive: (except?: symbol) => [...microphones].some(id => id !== except),
  isCreativeActive: () => creatives.size > 0,
  acquireCreative() {
    const id = Symbol(); creatives.add(id);
    listeners.forEach(listener => listener());
    return () => { if (creatives.delete(id)) listeners.forEach(listener => listener()); };
  },
  setMusicActive(active: boolean) {
    if (active === musicActive) return;
    musicActive = active;
    listeners.forEach(listener => listener());
  },
  acquireMicrophone(owner?: symbol) {
    const id = owner ?? Symbol(); microphones.add(id);
    listeners.forEach(listener => listener());
    return () => { if (microphones.delete(id)) listeners.forEach(listener => listener()); };
  },
};
