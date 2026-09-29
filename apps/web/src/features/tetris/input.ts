import { KEY_BINDINGS, type Action } from "./logic";

export type KeyBindings = Readonly<Record<string, readonly [number, Action]>>;
export type RepeatedAction = readonly [player: number, action: Action, pieceId?: number];
/** Capture the piece at press time, including presses during a clear transition. */
export class TetrisHeldInput {
  private readonly held = new Map<string, { next: number; binding: readonly [number, Action]; pieceId: number; downStep: number }>();
  constructor(public bindings: KeyBindings = KEY_BINDINGS) {}
  press(code: string, now: number, pieceId = 0, binding = this.bindings[code]): boolean {
    if (!binding || this.held.has(code)) return false;
    this.held.set(code, { next: now + 170, binding, pieceId, downStep: 2 });
    return true;
  }
  release(code: string) { this.held.delete(code); }
  clear() { this.held.clear(); }
  repeat(now: number, pieceIds?: readonly number[]): RepeatedAction[] {
    const actions: RepeatedAction[] = [];
    for (const held of this.held.values()) {
      const [player, action] = held.binding;
      if (action === "down" && pieceIds && held.pieceId !== pieceIds[player]) continue;
      if (now >= held.next && (action === "left" || action === "right" || action === "down")) {
        if (!actions.some(([seat, move]) => seat === player && move === action)) {
          const count = action === "down" ? held.downStep : 1;
          for (let index = 0; index < count; index++) actions.push([player, action, held.pieceId]);
          if (action === "down") held.downStep = Math.min(5, held.downStep + 1);
        }
        held.next = now + (action === "down" ? 50 : 75);
      }
    }
    return actions;
  }
}
