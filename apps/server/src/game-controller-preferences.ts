// Browser-safe contract: the server and all games validate the same persisted format.
export type ControlBinding = { kind: "button"; index: number } | { kind: "axis"; index: number; direction: -1 | 1 };
export type ControllerDevice = { id: string; mapping: "standard" | ""; occurrence: number };
export type PlayerControls = {
  mode: "keyboard" | "gamepad";
  device: ControllerDevice | null;
  bindings: Record<string, ControlBinding[]>;
};
export type GameControls = { playerCount: number; players: PlayerControls[] };
export type ControllerPreferences = { schemaVersion: 1; games: Record<string, GameControls> };
export const EMPTY_CONTROLLER_PREFERENCES: ControllerPreferences = { schemaVersion: 1, games: {} };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, names: string[]) {
  return Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
const identifier = (value: string) => /^[a-z][a-z0-9-]{0,63}$/.test(value) && !["constructor", "prototype"].includes(value);
const integer = (value: unknown, max: number) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
export function bindingKey(binding: ControlBinding): string {
  return binding.kind === "button" ? `b${binding.index}` : `a${binding.index}:${binding.direction}`;
}
export function parseControlBinding(value: unknown): ControlBinding | undefined {
  if (!record(value)) return;
  if (value.kind === "button" && keys(value, ["kind", "index"]) && integer(value.index, 63)) {
    return { kind: "button", index: value.index as number };
  }
  if (value.kind === "axis" && keys(value, ["kind", "index", "direction"]) && integer(value.index, 15)
    && (value.direction === -1 || value.direction === 1)) {
    return { kind: "axis", index: value.index as number, direction: value.direction };
  }
}
export function parseControllerPreferences(value: unknown): ControllerPreferences | undefined {
  if (!record(value) || !keys(value, ["schemaVersion", "games"]) || value.schemaVersion !== 1
    || !record(value.games) || Object.keys(value.games).length > 64) return;
  const games: Record<string, GameControls> = {};
  for (const [gameId, game] of Object.entries(value.games)) {
    if (!identifier(gameId) || !record(game) || !keys(game, ["playerCount", "players"])
      || !integer(game.playerCount, 4) || game.playerCount === 0 || !Array.isArray(game.players)
      || game.players.length < (game.playerCount as number) || game.players.length > 4) return;
    const players: PlayerControls[] = [];
    const devices = new Set<string>();
    for (const player of game.players) {
      if (!record(player) || !keys(player, ["mode", "device", "bindings"])
        || !["keyboard", "gamepad"].includes(player.mode as string) || !record(player.bindings)
        || Object.keys(player.bindings).length > 32) return;
      let device: ControllerDevice | null = null;
      if (player.device !== null) {
        const d = player.device;
        if (!record(d) || !keys(d, ["id", "mapping", "occurrence"]) || typeof d.id !== "string"
          || !d.id.trim() || d.id.length > 512 || (d.mapping !== "standard" && d.mapping !== "")
          || !integer(d.occurrence, 15)) return;
        device = { id: d.id, mapping: d.mapping, occurrence: d.occurrence as number };
        const key = JSON.stringify(device);
        if (player.mode === "gamepad" && devices.has(key)) return;
        if (player.mode === "gamepad") devices.add(key);
      }
      const bindings: Record<string, ControlBinding[]> = {};
      const used = new Set<string>();
      for (const [action, values] of Object.entries(player.bindings)) {
        if (!identifier(action) || !Array.isArray(values) || values.length > 2) return;
        bindings[action] = [];
        for (const raw of values) {
          const binding = parseControlBinding(raw);
          if (!binding || used.has(bindingKey(binding))) return;
          used.add(bindingKey(binding));
          bindings[action].push(binding);
        }
      }
      players.push({ mode: player.mode as PlayerControls["mode"], device, bindings });
    }
    games[gameId] = { playerCount: game.playerCount as number, players };
  }
  return { schemaVersion: 1, games };
}
