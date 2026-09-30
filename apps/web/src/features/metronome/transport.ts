import { eventsBetween, projectTicks, pulseCount, TICKS, type MusicProject, type ScheduledEvent } from "./logic";
export const COUNT_IN_BARS = 2;
export type TransportFrame = { tick: number; absoluteTick: number; phase: "stopped" | "countin" | "recording" | "playing"; beat: number; bar: number };
export const STOPPED: TransportFrame = { tick: 0, absoluteTick: 0, phase: "stopped", beat: 0, bar: 0 };
type Options = {
  now: () => number;
  project: (throughTick: number) => MusicProject;
  schedule: (event: ScheduledEvent, when: number, secondsPerTick: number) => void;
  frame: (frame: TransportFrame) => void;
  finishRecording: () => void;
  interrupted?: () => void;
  suppress: () => ReadonlySet<string>;
};
/** Audio-clock scheduling. UI frames never decide when sounds play. */
export class LoopTransport {
  private timer: ReturnType<typeof setInterval> | undefined;
  private startTime = 0;
  private cursor = 0;
  private secondsPerTick = 0;
  private recording = false;
  private recordingEnd = 0;
  private countInTicks = 0;
  private lastPump = 0;
  running = false;
  constructor(private options: Options) {}
  start(recording = false) {
    this.stop();
    const project = this.options.project(0);
    this.secondsPerTick = 60 / project.bpm / TICKS;
    this.recording = recording; this.recordingEnd = projectTicks(project);
    this.countInTicks = recording ? COUNT_IN_BARS * pulseCount(project.preset) * TICKS : 0;
    this.cursor = -this.countInTicks;
    this.startTime = this.options.now() + .06 - this.cursor * this.secondsPerTick;
    this.lastPump = this.options.now(); this.running = true;
    this.pump();
    this.timer = setInterval(() => this.pump(), 25);
  }
  position() { return this.running ? (this.options.now() - this.startTime) / this.secondsPerTick : 0; }
  private pump() {
    if (!this.running) return;
    const now = this.options.now();
    // No backlog burst after a suspended tab or a stalled main thread.
    if (now - this.lastPump > .5) { this.options.interrupted?.(); this.stop(); return; }
    this.lastPump = now;
    const tick = (now - this.startTime) / this.secondsPerTick;
    if (this.recording && tick >= this.recordingEnd) { this.recording = false; this.options.finishRecording(); }
    const through = tick + .10 / this.secondsPerTick;
    const project = this.options.project(through);
    const events = eventsBetween(project, this.cursor, through, {
      suppress: this.options.suppress(), suppressBefore: this.recordingEnd,
    });
    for (const event of events) this.options.schedule(event, this.startTime + event.tick * this.secondsPerTick, this.secondsPerTick);
    this.cursor = Math.max(this.cursor, through);
    const length = projectTicks(project), position = Math.max(0, tick) % length;
    // The small audio-start lead must display the first beat, not wrap to the last.
    const displayTick = Math.max(-this.countInTicks, tick), barTicks = pulseCount(project.preset) * TICKS;
    this.options.frame({
      tick: position, absoluteTick: tick,
      phase: tick < 0 && this.recording ? "countin" : this.recording ? "recording" : "playing",
      beat: ((Math.floor(displayTick / TICKS) % pulseCount(project.preset)) + pulseCount(project.preset)) % pulseCount(project.preset),
      bar: tick < 0 && this.recording ? Math.floor((displayTick + this.countInTicks) / barTicks) : Math.floor(position / barTicks),
    });
  }
  stop() {
    this.running = false; this.recording = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.options.frame(STOPPED);
  }
}
