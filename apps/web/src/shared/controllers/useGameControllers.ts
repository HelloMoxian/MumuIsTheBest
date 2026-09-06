import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { activeBindings, BindingCapture, ControllerInput, ControllerRoster, deviceKey, sameDevice, type ConnectedController, type ControllerActionEvent, type PadSample } from "./input";
import { controllerPreferences } from "./preferences";
import { bindingLabel, rebindAction, resolveGameControls, type GameControlDefinition, type GameControls } from "./registry";

type Options = { enabled: boolean; editing: boolean; onActions: (events: ControllerActionEvent[]) => void; onDisconnect: () => void };
type View = { devices: ConnectedController[]; problem: string; active: Record<string, string> };
type CaptureView = { player: number; action: string; ready: boolean };
export function useGameControllers(definition: GameControlDefinition, options: Options) {
  const saved = useSyncExternalStore(controllerPreferences.subscribe, controllerPreferences.getSnapshot);
  const profile = useMemo(() => resolveGameControls(definition, saved.preferences.games[definition.id]), [definition, saved.preferences]);
  const [view, setView] = useState<View>({ devices: [], problem: "", active: {} });
  const [capture, setCapture] = useState<CaptureView | null>(null);
  const [notice, setNotice] = useState("");
  const input = useRef(new ControllerInput());
  const captureRef = useRef<(CaptureView & { session: BindingCapture }) | null>(null);
  const latest = useRef({ options, profile });
  latest.current = { options, profile };
  const update = (next: GameControls) => controllerPreferences.update(definition.id, next);
  function reset() {
    const releases = input.current.reset();
    if (releases.length) latest.current.options.onActions(releases);
  }
  function cancelCapture() { captureRef.current = null; setCapture(null); reset(); }
  function beginCapture(player: number, action: string) {
    reset(); setNotice("");
    captureRef.current = { player, action, ready: false, session: new BindingCapture() };
    setCapture({ player, action, ready: false });
  }

  useEffect(() => { void controllerPreferences.load(); }, []);
  useEffect(() => {
    const roster = new ControllerRoster();
    let frame = 0;
    let signature = "";
    let previousConnected = new Set<string>();
    let lastView = "";
    let lastLive = 0;
    let live: Record<string, string> = {};
    const disconnect = (event: GamepadEvent) => {
      const { profile: current, options: callbacks } = latest.current;
      const affected = roster.at(event.gamepad.index);
      roster.disconnect(event.gamepad.index); reset();
      if (affected && current.players.slice(0, current.playerCount).some(p => p.mode === "gamepad" && sameDevice(p.device, affected.device))) callbacks.onDisconnect();
    };
    const connect = () => reset();
    const blur = () => { cancelCapture(); };
    const visibility = () => { if (document.hidden) blur(); };
    const keydown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && captureRef.current) { event.preventDefault(); event.stopImmediatePropagation(); cancelCapture(); }
    };
    function poll(now: number) {
      const { profile: current, options: callbacks } = latest.current;
      let samples: readonly (PadSample | null)[] = [];
      let problem = "";
      try {
        if (typeof navigator.getGamepads !== "function") problem = "当前浏览器未提供手柄支持，仍可使用键盘。";
        else samples = navigator.getGamepads();
      } catch { problem = "浏览器暂未允许读取手柄，请在本机地址或 HTTPS 页面打开；键盘仍可用。"; }
      const devices = roster.update(samples);
      const foreground = !document.hidden && document.hasFocus() && !document.querySelector("dialog[open]");
      const nextSignature = JSON.stringify([current, callbacks.enabled, callbacks.editing, foreground]);
      if (signature !== nextSignature) { reset(); previousConnected.clear(); signature = nextSignature; }
      const connected = new Set(current.players.slice(0, current.playerCount).filter(p => p.mode === "gamepad" && devices.some(d => sameDevice(d.device, p.device))).map(p => deviceKey(p.device!)));
      if ([...previousConnected].some(key => !connected.has(key))) callbacks.onDisconnect();
      previousConnected = connected;
      if (callbacks.editing && now - lastLive >= 100) {
        lastLive = now;
        live = Object.fromEntries(devices.map(device => {
          const pad = samples.find(p => p?.connected && p.index === device.index)!;
          return [deviceKey(device.device), activeBindings(pad).slice(0, 4).map(b => bindingLabel(b, device.device.mapping === "standard")).join(" · ")];
        }));
      } else if (!callbacks.editing) live = {};
      const nextView = { devices, problem, active: live };
      const viewSignature = JSON.stringify(nextView);
      if (lastView !== viewSignature) { lastView = viewSignature; setView(nextView); }
      const listening = captureRef.current;
      if (listening) {
        const device = devices.find(d => sameDevice(d.device, current.players[listening.player]?.device ?? null));
        const pad = device && samples.find(p => p?.connected && p.index === device.index);
        if (!pad || !callbacks.editing || !foreground) {
          cancelCapture(); setNotice("已取消换键，请连接手柄后再试。");
        } else {
          const result = listening.session.step(pad, now);
          if (result.ready !== listening.ready) {
            listening.ready = result.ready;
            setCapture({ player: listening.player, action: listening.action, ready: result.ready });
          }
          if (result.binding) {
            const binding = rebindAction(current.players[listening.player], listening.action, result.binding);
            if (binding.conflict) setNotice(`这个键已用于“${definition.actions.find(a => a.id === binding.conflict)?.label ?? binding.conflict}”，请先清除那个动作的键位。`);
            else if (binding.player) {
              update({ ...current, players: current.players.map((p, i) => i === listening.player ? binding.player! : p) });
              setNotice(`✓ ${definition.actions.find(a => a.id === listening.action)?.label}：${bindingLabel(result.binding, pad.mapping === "standard")}`);
            }
            cancelCapture();
          }
        }
      } else if (callbacks.enabled && !callbacks.editing && foreground) {
        const events = input.current.step(definition, current, devices, samples, now);
        if (events.length) callbacks.onActions(events);
      }
      frame = requestAnimationFrame(poll);
    }
    frame = requestAnimationFrame(poll);
    window.addEventListener("gamepadconnected", connect);
    window.addEventListener("gamepaddisconnected", disconnect);
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", keydown, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame); reset(); captureRef.current = null;
      window.removeEventListener("gamepadconnected", connect);
      window.removeEventListener("gamepaddisconnected", disconnect);
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", keydown, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [definition]);
  return { ...view, profile, update, saved, retry: controllerPreferences.retry, capture, notice, beginCapture, cancelCapture, reset };
}
export type GameControllerSession = ReturnType<typeof useGameControllers>;
