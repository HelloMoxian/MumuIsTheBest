import { KEY_BINDINGS, type Action } from "./logic";

/** Independent repeat clocks: OS keyboard repeat only services the last held key. */
export class TetrisHeldInput {
  private readonly held = new Map<string, number>();
  press(code: string, now: number): boolean {
    if (!KEY_BINDINGS[code] || this.held.has(code)) return false;
    this.held.set(code, now + 170);
    return true;
  }
  release(code: string) { this.held.delete(code); }
  clear() { this.held.clear(); }
  repeat(now: number): (readonly [number, Action])[] {
    const actions: (readonly [number, Action])[] = [];
    for (const [code, next] of this.held) {
      const binding = KEY_BINDINGS[code];
      const action = binding[1];
      if (now >= next && (action === "left" || action === "right" || action === "down")) {
        actions.push(binding);
        this.held.set(code, now + (action === "down" ? 50 : 75));
      }
    }
    return actions;
  }
}
