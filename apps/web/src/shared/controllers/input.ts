import { type ControlBinding, type ControllerDevice, type GameControlDefinition, type GameControls } from "./registry";

export type PadSample = {
  index: number; id: string; mapping: string; connected: boolean;
  buttons: readonly { pressed: boolean; value: number }[]; axes: readonly number[];
};
export type ConnectedController = { device: ControllerDevice; index: number; buttonCount: number; axisCount: number };
export const deviceKey = (device: ControllerDevice) => JSON.stringify([device.id, device.mapping, device.occurrence]);
export const sameDevice = (a: ControllerDevice | null, b: ControllerDevice | null) => !!a && !!b && deviceKey(a) === deviceKey(b);

// Keep holes when a pad disconnects: removing pad 1 must never move pad 2 into its seat.
export class ControllerRoster {
  private entries: (ConnectedController & { connected: boolean })[] = [];
  at(index: number) { return this.entries.find(entry => entry.connected && entry.index === index); }
  disconnect(index: number) { this.entries.forEach(entry => { if (entry.index === index) entry.connected = false; }); }
  update(samples: readonly (PadSample | null)[]): ConnectedController[] {
    const pads = samples.filter((pad): pad is PadSample => !!pad?.connected).slice(0, 16);
    for (const entry of this.entries) {
      if (!pads.some(p => p.index === entry.index && p.id === entry.device.id && (p.mapping === "standard" ? "standard" : "") === entry.device.mapping)) entry.connected = false;
    }
    for (const pad of pads) {
      if (this.entries.some(e => e.connected && e.index === pad.index)) continue;
      const mapping = pad.mapping === "standard" ? "standard" : "";
      const old = this.entries.find(e => !e.connected && e.device.id === pad.id && e.device.mapping === mapping);
      if (old) { old.connected = true; old.index = pad.index; old.buttonCount = pad.buttons.length; old.axisCount = pad.axes.length; }
      else {
        const occurrence = this.entries.filter(e => e.device.id === pad.id && e.device.mapping === mapping).length;
        if (pad.id.length <= 512 && occurrence < 16) this.entries.push({
          connected: true, index: pad.index, device: { id: pad.id, mapping, occurrence },
          buttonCount: pad.buttons.length, axisCount: pad.axes.length,
        });
      }
    }
    return this.entries.filter(e => e.connected).map(({ connected: _, ...entry }) => entry);
  }
}

function valueFor(binding: ControlBinding, pad: PadSample) {
  const value = binding.kind === "button"
    ? (pad.buttons[binding.index]?.value || (pad.buttons[binding.index]?.pressed ? 1 : 0))
    : (pad.axes[binding.index] ?? 0) * binding.direction;
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
export type ControllerActionEvent = { player: number; action: string; type: "press" | "release" | "repeat" | "value"; value: number };
type Held = { player: number; action: string; value: number; next: number };
export class ControllerInput {
  private armed = new Map<number, string>();
  private held = new Map<string, Held>();
  reset(): ControllerActionEvent[] {
    const releases = [...this.held.values()].map(h => ({ player: h.player, action: h.action, value: 0, type: "release" as const }));
    this.armed.clear(); this.held.clear();
    return releases;
  }
  step(definition: GameControlDefinition, config: GameControls, devices: ConnectedController[], samples: readonly (PadSample | null)[], now: number): ControllerActionEvent[] {
    const events: ControllerActionEvent[] = [];
    const alive = new Set<string>();
    config.players.slice(0, config.playerCount).forEach((player, index) => {
      const device = player.mode === "gamepad" && devices.find(d => sameDevice(d.device, player.device));
      const pad = device && samples.find(p => p?.connected && p.index === device.index);
      if (!device || !pad) { this.armed.delete(index); return; }
      const signature = `${deviceKey(device.device)}:${device.index}`;
      const raw = new Map(definition.actions.map(action => [action.id, Math.max(0, ...(player.bindings[action.id] ?? []).map(b => valueFor(b, pad)))]));
      if (this.armed.get(index) !== signature) {
        if ([...raw.values()].every(v => v < .35)) this.armed.set(index, signature);
        return;
      }
      for (const action of definition.actions) {
        const key = `${index}:${action.id}`;
        const held = this.held.get(key);
        const value = raw.get(action.id) ?? 0;
        const conflict = action.exclusiveWith?.some(id => (raw.get(id) ?? 0) >= .35);
        if (conflict || value < (held ? .35 : .55)) continue;
        alive.add(key);
        if (!held) {
          this.held.set(key, { player: index, action: action.id, value, next: now + (action.repeat?.delay ?? Infinity) });
          events.push({ player: index, action: action.id, value, type: "press" });
        } else {
          if (Math.abs(held.value - value) >= .03) {
            held.value = value;
            events.push({ player: index, action: action.id, value, type: "value" });
          }
          if (action.repeat && now >= held.next) {
            held.next = now + action.repeat.interval;
            events.push({ player: index, action: action.id, value, type: "repeat" });
          }
        }
      }
    });
    for (const [key, held] of this.held) {
      if (!alive.has(key)) {
        events.push({ player: held.player, action: held.action, value: 0, type: "release" });
        this.held.delete(key);
      }
    }
    return events;
  }
}

export function activeBindings(pad: PadSample): ControlBinding[] {
  const bindings: ControlBinding[] = [];
  pad.buttons.slice(0, 64).forEach((b, index) => { if (b.pressed || b.value >= .55) bindings.push({ kind: "button", index }); });
  pad.axes.slice(0, 16).forEach((v, index) => { if (Math.abs(v) >= .55) bindings.push({ kind: "axis", index, direction: v < 0 ? -1 : 1 }); });
  return bindings;
}
export class BindingCapture {
  private baseline: number[] | null = null;
  private stableSince = 0;
  private ready = false;
  step(pad: PadSample, now: number): { ready: boolean; binding?: ControlBinding } {
    if (!this.ready) {
      const buttonsReleased = pad.buttons.every(b => !b.pressed && b.value < .35);
      const sticksReleased = pad.mapping !== "standard" || pad.axes.slice(0, 4).every(v => Math.abs(v) < .35);
      if (!this.baseline || this.baseline.some((v, i) => Math.abs(v - pad.axes[i]) > .1) || !buttonsReleased || !sticksReleased) {
        this.baseline = [...pad.axes]; this.stableSince = now;
      } else if (now - this.stableSince >= 250) this.ready = true;
      return { ready: this.ready };
    }
    // Nonstandard trigger axes can rest at -1; capture only a fresh excursion from rest.
    const binding = activeBindings(pad).find(b => b.kind === "button" || Math.abs((pad.axes[b.index] ?? 0) - (this.baseline?.[b.index] ?? 0)) >= .65);
    return { ready: true, binding };
  }
}
