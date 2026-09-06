import assert from "node:assert/strict";
import { test } from "node:test";
import { activeBindings, BindingCapture, ControllerInput, ControllerRoster, sameDevice, type PadSample } from "./input";
import { defaultGameControls, rebindAction, registerGameControls, resolveGameControls } from "./registry";
import { TETRIS_CONTROLS, tetrisControllerIntent } from "../../features/tetris/controls";
import { act, createGame } from "../../features/tetris/logic";
import { TetrisHeldInput } from "../../features/tetris/input";

function pad(index = 0, buttons: number[] = [], axes = [0, 0, 0, 0], id = "Test controller"): PadSample {
  return { index, id, mapping: "standard", connected: true, axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })) };
}
function setup(count = 1) {
  const roster = new ControllerRoster();
  const devices = roster.update(Array.from({ length: count }, (_, i) => pad(i)));
  const config = defaultGameControls(TETRIS_CONTROLS);
  config.playerCount = count;
  devices.forEach((d, i) => { config.players[i].mode = "gamepad"; config.players[i].device = d.device; });
  const input = new ControllerInput();
  const step = (samples: (PadSample | null)[], now: number) => input.step(TETRIS_CONTROLS, config, roster.update(samples), samples, now);
  step(Array.from({ length: count }, (_, i) => pad(i)), 0);
  return { roster, config, input, step };
}

test("two identical pads retain seats across null holes, disconnects and reconnects", () => {
  const roster = new ControllerRoster();
  const initial = roster.update([pad(0), null, pad(2)]);
  assert.deepEqual(initial.map(d => d.device.occurrence), [0, 1]);
  const remaining = roster.update([null, null, pad(2)]);
  assert.equal(remaining.length, 1);
  assert.ok(sameDevice(remaining[0].device, initial[1].device));
  const restored = roster.update([null, pad(1), pad(2)]);
  assert.equal(restored.find(d => sameDevice(d.device, initial[0].device))?.index, 1);
  assert.equal(restored.find(d => sameDevice(d.device, initial[1].device))?.index, 2);
  roster.disconnect(1);
  assert.equal(roster.at(1), undefined);
  assert.equal(roster.at(2)?.device.occurrence, 1);
});

test("movement repeats independently while rotation and hard drop fire once", () => {
  const { step } = setup(2);
  const samples = [pad(0, [14, 0]), pad(1, [15, 3])];
  const first = step(samples, 10);
  assert.deepEqual(first.map(e => [e.player, e.action, e.type]), [[0, "left", "press"], [0, "rotate", "press"], [1, "right", "press"], [1, "drop", "press"]]);
  assert.equal(step(samples, 100).length, 0);
  assert.deepEqual(step(samples, 180).map(e => [e.player, e.action, e.type]), [[0, "left", "repeat"], [1, "right", "repeat"]]);
  const release = step([pad(0), pad(1, [15, 3])], 260);
  assert.ok(release.some(e => e.player === 0 && e.action === "left" && e.type === "release"));
  assert.ok(release.some(e => e.player === 1 && e.action === "right" && e.type === "repeat"));
});

test("axis hysteresis ignores drift, prevents opposing directions and avoids catch-up bursts", () => {
  const { step } = setup();
  assert.deepEqual(step([pad(0, [], [.2, 0, 0, 0])], 10), []);
  assert.equal(step([pad(0, [], [.7, 0, 0, 0])], 20)[0].type, "press");
  assert.ok(step([pad(0, [], [.4, 0, 0, 0])], 30).every(e => e.type !== "release"));
  assert.equal(step([pad(0, [], [.2, 0, 0, 0])], 40)[0].type, "release");
  assert.deepEqual(step([pad(0, [14, 15])], 50), []);
  step([pad(0, [14])], 60);
  assert.equal(step([pad(0, [14])], 50_000).filter(e => e.type === "repeat").length, 1);
});

test("pause, a held reconnect button and reused device indices require neutral release", () => {
  const { input, step } = setup();
  assert.equal(step([pad(0, [3])], 10)[0].action, "drop");
  assert.equal(input.reset()[0].type, "release");
  assert.deepEqual(step([pad(0, [3])], 20), []);
  step([pad(0)], 30);
  assert.equal(step([pad(0, [3])], 40)[0].type, "press");
  assert.equal(step([null], 50)[0].type, "release");
  assert.deepEqual(step([pad(0, [3])], 60), []);
  assert.deepEqual(step([pad(0, [3], undefined, "Different pad")], 70), []);
});

test("gamepad mode is opt-in per seat and unbound up never rotates or drops", () => {
  const { config, step } = setup(2);
  config.players[1].mode = "keyboard";
  assert.deepEqual(step([pad(0, [12], [0, -1, 0, 0]), pad(1, [3])], 10), []);
});

test("analog triggers retain strength changes for games such as acceleration", () => {
  const { config, step } = setup();
  config.players[0].bindings.rotate = [{ kind: "button", index: 7 }];
  const at = (value: number) => {
    const sample = pad();
    return { ...sample, buttons: sample.buttons.map((b, i) => i === 7 ? { value, pressed: value > .5 } : b) };
  };
  const pressed = step([at(.65)], 10).find(e => e.action === "rotate")!;
  assert.equal(pressed.type, "press"); assert.equal(pressed.value, .65);
  const changed = step([at(.9)], 20).find(e => e.action === "rotate")!;
  assert.equal(changed.type, "value"); assert.equal(changed.value, .9);
  assert.equal(step([at(.1)], 30).find(e => e.action === "rotate")?.type, "release");
});

test("capture waits for released controls, then accepts buttons or fresh axis directions", () => {
  const capture = new BindingCapture();
  assert.equal(capture.step(pad(0, [3]), 0).ready, false);
  assert.equal(capture.step(pad(0, [3]), 300).ready, false);
  capture.step(pad(0), 310);
  assert.equal(capture.step(pad(0), 600).ready, true);
  assert.deepEqual(capture.step(pad(0, [5]), 620).binding, { kind: "button", index: 5 });
  const axis = new BindingCapture();
  axis.step(pad(0), 0); axis.step(pad(0), 300);
  assert.deepEqual(axis.step(pad(0, [], [-.9, 0, 0, 0]), 320).binding, { kind: "axis", index: 0, direction: -1 });
  const generic = new BindingCapture();
  const atRest = { ...pad(0, [], [0, 0, -1]), mapping: "" };
  generic.step(atRest, 0);
  assert.equal(generic.step(atRest, 300).ready, true);
  assert.equal(generic.step(atRest, 320).binding, undefined);
  assert.deepEqual(generic.step({ ...atRest, axes: [0, 0, 1] }, 400).binding, { kind: "axis", index: 2, direction: 1 });
  assert.equal(activeBindings(pad(0, [5])).length, 1);
});

test("rebinding refuses conflicts and preserves other player's mapping", () => {
  const config = defaultGameControls(TETRIS_CONTROLS);
  assert.equal(rebindAction(config.players[0], "rotate", { kind: "button", index: 3 }).conflict, "drop");
  const changed = rebindAction(config.players[0], "rotate", { kind: "button", index: 5 }).player!;
  assert.deepEqual(changed.bindings.rotate, [{ kind: "button", index: 5 }]);
  assert.deepEqual(config.players[1].bindings.rotate, [{ kind: "button", index: 0 }]);
});

test("games register their own actions; new actions migrate additively without stealing custom keys", () => {
  const car = registerGameControls({ id: "test-car", label: "赛车", maxPlayers: 1, actions: [
    { id: "accelerate", label: "加速", description: "按住加速", defaults: [{ kind: "button", index: 7 }] },
    { id: "item", label: "使用道具", description: "按一下使用", defaults: [{ kind: "button", index: 0 }] },
  ] });
  const old = defaultGameControls(car);
  old.players[0].bindings = { accelerate: [], item: [{ kind: "button", index: 4 }] };
  const expanded = { ...car, actions: [...car.actions, { id: "horn", label: "喇叭", description: "鸣笛", defaults: [{ kind: "button" as const, index: 4 }] }] };
  const resolved = resolveGameControls(expanded, old);
  assert.deepEqual(resolved.players[0].bindings, { accelerate: [], item: [{ kind: "button", index: 4 }], horn: [] });
  assert.throws(() => registerGameControls({ ...car, actions: [car.actions[0], car.actions[0]] }));
});

test("Tetris uses the shared action stream with zero gravity and simultaneous keyboard input", () => {
  const { step } = setup(2);
  const games = [createGame({ initialSpeed: 0, speedIncrement: 0 }, 1), createGame({ initialSpeed: 0, speedIncrement: 0 }, 1)];
  const positions = games.map(g => g.piece.x);
  const intent = tetrisControllerIntent(step([pad(0, [14]), pad(1, [15])], 10));
  intent.moves.forEach(({ player, action }) => act(games[player], action));
  assert.deepEqual(games.map(g => g.piece.x), [positions[0] - 1, positions[1] + 1]);
  const keyboard = new TetrisHeldInput();
  keyboard.press("ArrowDown", 0);
  keyboard.repeat(180).forEach(([player, action]) => act(games[player], action));
  assert.ok(games[0].piece.y > games[1].piece.y);
  const pause = tetrisControllerIntent(step([pad(0, [9]), pad(1, [9, 3])], 20));
  assert.equal(pause.pause, true); assert.deepEqual(pause.moves, []);
});
