import { registerGameControls } from "../../shared/controllers/registry";
export const DIAMOND_CONTROLS = registerGameControls({
  id: "diamond-blocks", label: "钻石方块", maxPlayers: 1,
  actions: [
    { id: "left", label: "左移", description: "按住连续移动", direction: "left", defaults: [{ kind: "button", index: 14 }, { kind: "axis", index: 0, direction: -1 }], repeat: { delay: 180, interval: 90 }, exclusiveWith: ["right"] },
    { id: "right", label: "右移", description: "按住连续移动", direction: "right", defaults: [{ kind: "button", index: 15 }, { kind: "axis", index: 0, direction: 1 }], repeat: { delay: 180, interval: 90 }, exclusiveWith: ["left"] },
    { id: "down", label: "下移", description: "按住加速下落", direction: "down", defaults: [{ kind: "button", index: 13 }, { kind: "axis", index: 1, direction: 1 }], repeat: { delay: 180, interval: 65 } },
    { id: "rotate", label: "换序", description: "循环三颗元素", defaults: [{ kind: "button", index: 0 }] },
    { id: "reverse", label: "反向换序", description: "反向循环", defaults: [{ kind: "button", index: 2 }] },
    { id: "drop", label: "直落", description: "直接落到虚线位置", defaults: [{ kind: "button", index: 3 }] },
    { id: "pause", label: "暂停", description: "回到导航", defaults: [{ kind: "button", index: 9 }] },
  ],
});
