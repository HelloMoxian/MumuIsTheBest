import { bindingKey, parseControllerPreferences, type ControlBinding, type GameControls, type PlayerControls } from "../../../../server/src/game-controller-preferences";
export { bindingKey, parseControllerPreferences } from "../../../../server/src/game-controller-preferences";
export type { ControlBinding, ControllerDevice, ControllerPreferences, GameControls, PlayerControls } from "../../../../server/src/game-controller-preferences";

export type GameAction = {
  id: string;
  label: string;
  description: string;
  defaults: ControlBinding[];
  repeat?: { delay: number; interval: number };
  exclusiveWith?: string[];
};
export type GameControlDefinition = { id: string; label: string; maxPlayers: number; actions: readonly GameAction[] };
const definitions = new Map<string, GameControlDefinition>();
export function registerGameControls(definition: GameControlDefinition): GameControlDefinition {
  if (new Set(definition.actions.map(a => a.id)).size !== definition.actions.length || !definition.actions.length
    || !Number.isInteger(definition.maxPlayers) || definition.maxPlayers < 1 || definition.maxPlayers > 4
    || definition.actions.some(a => !a.label || (a.repeat && (![a.repeat.delay, a.repeat.interval].every(v => Number.isFinite(v) && v > 0))))
    || !parseControllerPreferences({ schemaVersion: 1, games: { [definition.id]: defaultGameControls(definition) } })) throw new Error("游戏动作注册不完整。");
  definitions.set(definition.id, definition);
  return definition;
}
export const getGameControlDefinition = (id: string) => definitions.get(id);
export function defaultBindings(definition: GameControlDefinition) {
  return Object.fromEntries(definition.actions.map(a => [a.id, a.defaults.map(b => ({ ...b }))]));
}
export function defaultGameControls(definition: GameControlDefinition): GameControls {
  return { playerCount: 1, players: Array.from({ length: definition.maxPlayers }, () => ({
    mode: "keyboard", device: null, bindings: defaultBindings(definition),
  })) };
}
// Add newly registered actions without overwriting intentional empty/custom mappings.
export function resolveGameControls(definition: GameControlDefinition, saved?: GameControls): GameControls {
  const defaults = defaultGameControls(definition);
  if (!saved) return defaults;
  return {
    playerCount: Math.min(definition.maxPlayers, saved.playerCount),
    players: defaults.players.map((fallback, index) => {
      const old = saved.players[index];
      if (!old) return fallback;
      const used = new Set(Object.values(old.bindings).flat().map(bindingKey));
      return { ...old, bindings: Object.fromEntries(definition.actions.map(a => [a.id,
        old.bindings[a.id] ?? (old.device?.mapping === "" ? [] : a.defaults.filter(b => !used.has(bindingKey(b)))),
      ])) };
    }),
  };
}
export function rebindAction(player: PlayerControls, action: string, binding: ControlBinding): { player?: PlayerControls; conflict?: string } {
  const conflict = Object.entries(player.bindings).find(([id, bindings]) => id !== action && bindings.some(b => bindingKey(b) === bindingKey(binding)));
  if (conflict) return { conflict: conflict[0] };
  return { player: { ...player, bindings: { ...player.bindings, [action]: [binding] } } };
}
const BUTTON_NAMES = ["下方键 A / ×", "右侧键 B / ○", "左侧键 X / □", "上方键 Y / △", "左肩 LB / L1", "右肩 RB / R1", "左扳机 LT / L2", "右扳机 RT / R2", "选择 / 返回", "菜单 / Start", "左摇杆按下", "右摇杆按下", "十字键 ↑", "十字键 ↓", "十字键 ←", "十字键 →", "主页键"];
export function bindingLabel(binding: ControlBinding, standard = true): string {
  if (binding.kind === "button") return standard && BUTTON_NAMES[binding.index] || `按钮 ${binding.index + 1}`;
  if (standard && binding.index < 4) return `${binding.index < 2 ? "左" : "右"}摇杆 ${binding.index % 2 === 0 ? binding.direction < 0 ? "←" : "→" : binding.direction < 0 ? "↑" : "↓"}`;
  return `轴 ${binding.index + 1} ${binding.direction < 0 ? "负方向" : "正方向"}`;
}
