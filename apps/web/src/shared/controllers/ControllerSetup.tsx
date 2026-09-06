import { deviceKey, sameDevice } from "./input";
import { bindingLabel, defaultBindings, type GameControlDefinition, type PlayerControls } from "./registry";
import type { GameControllerSession } from "./useGameControllers";
import "./controllers.css";

export function ControllerSetup({ definition, session, lockPlayerCount = false }: {
  definition: GameControlDefinition; session: GameControllerSession; lockPlayerCount?: boolean;
}) {
  const { profile, devices, saved, capture } = session;
  const busy = saved.status === "loading" || !!capture;
  function updatePlayer(index: number, player: PlayerControls) {
    session.update({ ...profile, players: profile.players.map((p, i) => i === index ? player : p) });
  }
  return <section className="controller-setup" aria-label={`${definition.label}控制设置`}>
    <div className="controller-mode" role="group" aria-label="游戏人数">
      {Array.from({ length: definition.maxPlayers }, (_, i) => i + 1).map(count => <button type="button" key={count}
        disabled={busy || lockPlayerCount} aria-pressed={profile.playerCount === count}
        onClick={() => session.update({ ...profile, playerCount: count })}>
        {profile.playerCount === count ? "✓ " : ""}{count === 1 ? "单人探索" : count === 2 ? "双人同玩" : `${count} 人同玩`}
      </button>)}
    </div>
    <div className="controller-seats">
      {profile.players.slice(0, profile.playerCount).map((player, index) => {
        const connected = devices.find(d => sameDevice(d.device, player.device));
        return <div className="controller-seat" key={index}>
          <strong>玩家 {index + 1}</strong>
          <div className="controller-mode" role="group" aria-label={`玩家 ${index + 1} 输入方式`}>
            {(["keyboard", "gamepad"] as const).map(mode => <button type="button" key={mode} disabled={busy} aria-pressed={player.mode === mode} onClick={() => {
              let device = player.device;
              if (mode === "gamepad" && profile.players.some((p, i) => i !== index && p.mode === "gamepad" && sameDevice(p.device, device))) device = null;
              updatePlayer(index, { ...player, mode, device });
            }}>{player.mode === mode ? "✓ " : ""}{mode === "keyboard" ? "键盘" : "手柄"}</button>)}
          </div>
          <p title={connected?.device.id}>{player.mode === "keyboard" ? "键盘与屏幕按钮可用" : connected ? `✓ ${connected.device.id.length > 48 ? `${connected.device.id.slice(0, 48)}…` : connected.device.id} · 第 ${connected.device.occurrence + 1} 只` : "等待选择或连接手柄 · 可先用键盘"}</p>
        </div>;
      })}
    </div>
    <details className="controller-details" open={capture ? true : undefined}>
      <summary>手柄与键位 · {devices.length ? `${devices.length} 只已连接` : "连接与设置"}</summary>
      <p>先用 USB 或蓝牙在电脑上连接手柄，再回到此页按一下手柄。每位玩家选择自己的设备；键盘始终可用。</p>
      {session.problem && <p className="controller-error" role="status">{session.problem}</p>}
      {!devices.length && !session.problem && <p className="controller-empty">还没有发现手柄。连接后按一下按键，设备会自动出现在下面。</p>}
      <p>按键以物理位置为准，手柄上的字母可能不同。同型号的多只手柄按首次连接顺序编号，改变顺序后请核对玩家归属。</p>
      <p>未列出的按键暂未使用，也可以选来换键。</p>
      {profile.players.slice(0, profile.playerCount).map((player, index) => {
        if (player.mode !== "gamepad") return null;
        const connected = devices.find(d => sameDevice(d.device, player.device));
        const available = devices.filter(d => !profile.players.some((p, i) => i !== index && p.mode === "gamepad" && sameDevice(p.device, d.device)));
        const standard = player.device?.mapping !== "";
        return <fieldset key={index} className="controller-mapping" disabled={saved.status === "loading"}>
          <legend>玩家 {index + 1} 的手柄</legend>
          <label>使用哪只手柄
            <select value={player.device ? deviceKey(player.device) : ""} disabled={!!capture} onChange={event => {
              const device = available.find(d => deviceKey(d.device) === event.target.value)?.device ?? null;
              const changedLayout = device && (device.id !== player.device?.id || device.mapping !== player.device?.mapping);
              updatePlayer(index, { ...player, device, bindings: changedLayout ? device.mapping === "standard" ? defaultBindings(definition) : Object.fromEntries(definition.actions.map(a => [a.id, []])) : player.bindings });
            }}>
              <option value="">请选择手柄</option>
              {player.device && !connected && <option value={deviceKey(player.device)}>已保存的手柄 · 未连接</option>}
              {available.map(d => <option key={deviceKey(d.device)} value={deviceKey(d.device)}>{d.device.id} · 同型号第 {d.device.occurrence + 1} 只</option>)}
            </select>
          </label>
          {!standard && <p className="controller-error">此手柄使用自定义布局，请为下面的动作逐一换键。编号不代表 A、B、X、Y。</p>}
          <div className="controller-live" aria-label={`玩家 ${index + 1} 手柄测试`}>
            {connected ? session.active[deviceKey(connected.device)] ? `正在按：${session.active[deviceKey(connected.device)]}` : "✓ 手柄就绪 · 试按一下，看看是哪个键" : "手柄未连接，已保存的键位仍会保留"}
          </div>
          <div className="controller-bindings">
            {definition.actions.map(action => <div className="controller-binding" key={action.id}>
              <div><strong>{action.label}</strong><span>{action.description}</span><b>{player.bindings[action.id]?.map(b => bindingLabel(b, standard)).join(" / ") || "尚未设置"}</b></div>
              <div className="controller-binding-buttons">
                <button type="button" disabled={!connected || !!capture} onClick={() => session.beginCapture(index, action.id)} aria-label={`玩家 ${index + 1} ${action.label}换键`}>换键</button>
                <button type="button" disabled={!!capture || !player.bindings[action.id]?.length} onClick={() => updatePlayer(index, { ...player, bindings: { ...player.bindings, [action.id]: [] } })} aria-label={`清除玩家 ${index + 1} ${action.label}键位`}>清除</button>
              </div>
            </div>)}
          </div>
          <button type="button" disabled={!!capture} onClick={() => updatePlayer(index, { ...player, bindings: standard ? defaultBindings(definition) : Object.fromEntries(definition.actions.map(a => [a.id, []])) })}>{standard ? "恢复这位玩家的默认键位" : "清空这位玩家的键位"}</button>
        </fieldset>;
      })}
    </details>
    {capture && <div className="controller-capture" role="status">
      <strong>玩家 {capture.player + 1} · {definition.actions.find(a => a.id === capture.action)?.label}</strong>
      <p>{capture.ready ? "现在按想使用的键，或推动摇杆方向。" : "先松开所有按键，让摇杆回到中间。"}</p>
      <button type="button" onClick={session.cancelCapture}>取消换键（Escape）</button>
    </div>}
    {session.notice && <p role="status">{session.notice}</p>}
    <div className={`controller-save ${saved.status.endsWith("error") ? "controller-error" : ""}`} role="status">
      <span>{saved.message}</span>{saved.status.endsWith("error") && <button type="button" disabled={lockPlayerCount && saved.status === "read-error"} onClick={() => void session.retry()}>{saved.status === "read-error" ? lockPlayerCount ? "本局结束后重试读取" : "重试读取并保存选择" : "重试保存"}</button>}
    </div>
  </section>;
}
