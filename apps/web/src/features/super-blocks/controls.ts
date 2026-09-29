import { registerGameControls } from "../../shared/controllers/registry";
import type { ControllerActionEvent } from "../../shared/controllers/input";
import type { Action } from "./logic";

export const SUPER_BLOCKS_CONTROLS = registerGameControls({
  id: "super-blocks", label: "超级积木", maxPlayers: 1,
  actions: [
    { id: "left", label: "左移", description: "按住可连续移动", defaults: [{ kind: "button", index: 14 }, { kind: "axis", index: 0, direction: -1 }], repeat: { delay: 170, interval: 75 }, exclusiveWith: ["right"] },
    { id: "right", label: "右移", description: "按住可连续移动", defaults: [{ kind: "button", index: 15 }, { kind: "axis", index: 0, direction: 1 }], repeat: { delay: 170, interval: 75 }, exclusiveWith: ["left"] },
    { id: "down", label: "下移", description: "按住可加快下移", defaults: [{ kind: "button", index: 13 }, { kind: "axis", index: 1, direction: 1 }], repeat: { delay: 170, interval: 50 } },
    { id: "rotate", label: "右旋", description: "每按一次，顺时针旋转", defaults: [{ kind: "button", index: 0 }] },
    { id: "reverse", label: "左旋", description: "每按一次，逆时针旋转", defaults: [{ kind: "button", index: 2 }] },
    { id: "drop", label: "直落", description: "直接落到底部并固定", defaults: [{ kind: "button", index: 3 }] },
    { id: "pause", label: "暂停 / 继续", description: "让本局休息或继续", defaults: [{ kind: "button", index: 9 }] },
  ],
});
export function superBlocksControllerIntent(events: ControllerActionEvent[]) {
  const actions = events.filter(event => event.type === "press" || event.type === "repeat");
  const pause = actions.some(event => event.action === "pause" && event.type === "press");
  const moves = pause ? [] : actions.filter(event => ["left", "right", "down", "rotate", "reverse", "drop"].includes(event.action)).map(event => event.action as Action);
  return { pause, moves };
}
