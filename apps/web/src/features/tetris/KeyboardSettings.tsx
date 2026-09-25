import { useEffect, useRef, useState } from "react";
import { KEY_BINDINGS, type Action } from "./logic";
import type { KeyBindings } from "./input";
import { allowedKey, KEY_ACTIONS, keyFor, keyLabel, rebindKeyboard } from "./keyboard";

export function KeyboardSettings({ bindings, players, notice, update }: {
  bindings: KeyBindings; players: number; notice: string; update: (bindings: KeyBindings) => void;
}) {
  const [capture, setCapture] = useState<{ player: number; action: Action } | null>(null);
  const [conflictKey, setConflictKey] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const origin = useRef<HTMLButtonElement | null>(null);
  function cancel(restoreFocus = true) { setCapture(null); setConflictKey(null); if (restoreFocus) origin.current?.focus(); }
  useEffect(() => {
    if (!capture) return;
    const listen = (event: KeyboardEvent) => {
      if (event.code === "Tab") return;
      if (event.target instanceof HTMLButtonElement && event.target !== origin.current && ["Enter", "Space"].includes(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.code === "Escape") { cancel(); return; }
      if (event.repeat || event.isComposing) return;
      setConflictKey(null);
      if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || !allowedKey(event.code)) { setProblem("请选择一个字母、数字、方向键或空格键；P 和 Escape 留作暂停。"); return; }
      const old = keyFor(bindings, capture.player, capture.action);
      if (bindings[event.code] && old !== event.code) { setConflictKey(event.code); setProblem(`${keyLabel(event.code)} 已用于玩家 ${bindings[event.code][0] + 1} 的${KEY_ACTIONS.find(a => a.action === bindings[event.code][1])!.label}，请换一个键。`); return; }
      update(rebindKeyboard(bindings, capture.player, capture.action, event.code)); setProblem(""); cancel();
    };
    const blur = () => cancel(false);
    window.addEventListener("keydown", listen, true);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", listen, true); window.removeEventListener("blur", blur); };
  }, [capture, bindings, update]);
  return <section className="tetris-keyboard-settings" aria-label="键盘设置" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) cancel(false); }}>
    <h3>键盘设置</h3><p>点击动作，再按喜欢的键。设置保存在此浏览器中。</p>
    <div className="tetris-keyboard-players">{Array.from({ length: players }, (_, player) => <fieldset key={player}><legend>玩家 {player + 1}</legend>
      {KEY_ACTIONS.map(({ action, label }) => <button className="tetris-button" type="button" key={action} aria-pressed={capture?.player === player && capture.action === action} onClick={event => { origin.current = event.currentTarget; setProblem(""); setConflictKey(null); setCapture({ player, action }); }}><span>{label}</span><kbd>{keyLabel(keyFor(bindings, player, action))}</kbd></button>)}
    </fieldset>)}</div>
    {capture && <p role="status">请按新的按键（Escape 取消）<button className="tetris-button" type="button" onClick={() => cancel()}>取消换键</button></p>}
    {problem && <p role="alert" className="tetris-validation">{problem}</p>}
    {capture && conflictKey && <button className="tetris-button" type="button" onClick={() => { update(rebindKeyboard(bindings, capture.player, capture.action, conflictKey)); setProblem(""); cancel(); }}>互换这两个键位</button>}
    <p role="status">{notice}</p><div className="tetris-toolbar"><button className="tetris-button" type="button" onClick={() => { cancel(); setProblem(""); update(KEY_BINDINGS); }}>恢复默认键位</button><button className="tetris-button" type="button" onClick={() => update(bindings)}>再次保存</button></div>
  </section>;
}
