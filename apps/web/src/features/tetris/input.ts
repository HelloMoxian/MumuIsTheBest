import { KEY_BINDINGS, type Action } from "./logic";

export type KeyBindings = Readonly<Record<string, readonly [number, Action]>>;
/** Capture the piece at press time, including presses during a clear transition. */
export class TetrisHeldInput {
  private readonly held = new Map<string, { next: number; binding: readonly [number, Action]; pieceId: number }>();
  constructor(public bindings: KeyBindings = KEY_BINDINGS) {}
  press(code: string, now: number, pieceId = 0, binding = this.bindings[code]): boolean {
    if (!binding || this.held.has(code)) return false;
    this.held.set(code, { next: now + 170, binding, pieceId });
    return true;
  }
  release(code: string) { this.held.delete(code); }
  clear() { this.held.clear(); }
  repeat(now: number, pieceIds?: readonly number[]): (readonly [number, Action])[] {
    const actions: (readonly [number, Action])[] = [];
    for (const held of this.held.values()) {
      const [player, action] = held.binding;
      if (action === "down" && pieceIds && held.pieceId !== pieceIds[player]) continue;
      if (now >= held.next && (action === "left" || action === "right" || action === "down")) {
        if (!actions.some(([seat, move]) => seat === player && move === action)) actions.push(held.binding);
        held.next = now + (action === "down" ? 50 : 75);
      }
    }
    return actions;
  }
}
