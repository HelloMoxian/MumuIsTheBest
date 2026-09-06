/** Finish the current bilingual unit; retain at most one, newest, pending unit. */
export class LatestMomentQueue<T> {
  private pending: T | undefined;
  private running = false;
  private paused = false;
  private suspended = false;
  private enabled = true;
  private generation = 0;
  constructor(private output: {
    play: (value: T) => Promise<{ status: string }>;
    stop: () => void; pause: () => void; resume: () => void;
    busy: () => boolean; show: (value: T) => void;
    failed?: () => void;
  }) {}
  enqueue(value: T) {
    if (!this.enabled) return;
    this.pending = value;
    this.wake();
  }
  setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) this.clear(); else this.wake(); }
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused && this.running) { this.suspended = true; this.output.pause(); }
    else this.wake();
  }
  wake() {
    if (!this.enabled || this.paused) return;
    if (this.running) {
      if (this.suspended && !this.output.busy()) { this.suspended = false; this.output.resume(); }
      return;
    }
    if (this.pending === undefined || this.output.busy()) return;
    const value = this.pending; this.pending = undefined;
    this.running = true; this.suspended = false;
    const generation = this.generation;
    this.output.show(value);
    let playback: Promise<{ status: string }>;
    try { playback = this.output.play(value); } catch { playback = Promise.resolve({ status: "error" }); }
    void playback.then(result => {
      if (generation !== this.generation) return;
      this.running = false;
      if (result.status === "error" || result.status === "unavailable") this.output.failed?.();
      this.wake();
    }, () => {
      if (generation !== this.generation) return;
      this.running = false; this.output.failed?.(); this.wake();
    });
  }
  clear() {
    this.generation++; this.pending = undefined;
    const wasRunning = this.running;
    this.running = false; this.suspended = false;
    if (wasRunning) this.output.stop();
  }
  dispose() { this.enabled = false; this.clear(); }
}
