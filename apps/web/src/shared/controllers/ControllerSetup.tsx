import { deviceKey, sameDevice } from "./input";
import { bindingLabel, defaultBindings, type GameControlDefinition, type PlayerControls } from "./registry";
import type { GameControllerSession } from "./useGameControllers";
import "./controllers.css";

const FIXED_DIRECTION_LABELS = {
  up: "十字键 ↑ / 左摇杆 ↑",
  down: "十字键 ↓ / 左摇杆 ↓",
  left: "十字键 ← / 左摇杆 ←",
  right: "十字键 → / 左摇杆 →",
};

export function ControllerSetup({ definition, session, lockPlayerCount = false, showOverview = true, showDetails = true, showStatus = true }: {
  definition: GameControlDefinition; session: GameControllerSession; lockPlayerCount?: boolean; showOverview?: boolean; showDetails?: boolean; showStatus?: boolean;
}) {
  const { profile, devices, saved, capture } = session;
  const busy = saved.status === "loading" || !!capture;
  function updatePlayer(index: number, player: PlayerControls) {
    session.update({ ...profile, players: profile.players.map((p, i) => i === index ? player : p) });
  }
  return <section className="controller-setup" aria-label={`${definition.label}控制设置`}>
    {showOverview && <><div className="controller-mode" role="group" aria-label="游戏人数">
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
          <p title={connected?.device.id}>{connected ? `✓ 手柄已自动接入 · ${connected.device.id.length > 40 ? `${connected.device.id.slice(0, 40)}…` : connected.device.id}` : "连接手柄即可操作 · 键盘与屏幕按钮也可用"}</p>
        </div>;
      })}
    </div></>}
    {showDetails && <details className="controller-details" open={capture ? true : undefined}>
      <summary>手柄与键位 · {devices.length ? `${devices.length} 只已连接` : "连接与设置"}</summary>
      <p>用 USB 或蓝牙连接后即可操作，不需要选择输入模式或指定设备。左摇杆和十字方向键始终执行同一套上下左右操作，用哪一个都可以。单人时所有已连接手柄都能操作；双人时自动分配给玩家 1 和玩家 2，键盘始终可用。</p>
      {session.problem && <p className="controller-error" role="status">{session.problem}</p>}
      {!devices.length && !session.problem && <p className="controller-empty">还没有发现手柄。连接后按一下按键，设备会自动出现在下面。</p>}
      <p>按键以物理位置为准，手柄上的字母可能不同。同型号的多只手柄按首次连接顺序编号，改变顺序后请核对玩家归属。</p>
      <p>未列出的按键暂未使用，也可以选来换键。</p>
      {profile.players.slice(0, profile.playerCount).map((player, index) => {
        const connected = devices.find(d => sameDevice(d.device, player.device));
        const standard = player.device?.mapping !== "";
        return <fieldset key={index} className="controller-mapping" disabled={saved.status === "loading"}>
          <legend>玩家 {index + 1} 的手柄</legend>
          <p title={connected?.device.id}>{connected ? `✓ 已自动分配：${connected.device.id} · 同型号第 ${connected.device.occurrence + 1} 只` : "连接后会自动分配，无需在这里选择设备。"}</p>
          {!standard && <p className="controller-error">此手柄使用自定义布局，请为下面的动作逐一换键。编号不代表 A、B、X、Y。</p>}
          <div className="controller-live" aria-label={`玩家 ${index + 1} 手柄测试`}>
            {connected ? session.active[deviceKey(connected.device)] ? `正在按：${session.active[deviceKey(connected.device)]}` : "✓ 手柄就绪 · 试按一下，看看是哪个键" : "手柄未连接，已保存的键位仍会保留"}
          </div>
          <div className="controller-bindings">
            {definition.actions.map(action => <div className="controller-binding" key={action.id}>
              <div><strong>{action.label}</strong><span>{action.description}</span><b>{action.direction && standard ? FIXED_DIRECTION_LABELS[action.direction] : player.bindings[action.id]?.map(b => bindingLabel(b, standard)).join(" / ") || "尚未设置"}</b></div>
              <div className="controller-binding-buttons">
                {action.direction && standard ? <span>固定双输入</span> : <>
                  <button type="button" disabled={!connected || !!capture} onClick={() => session.beginCapture(index, action.id)} aria-label={`玩家 ${index + 1} ${action.label}换键`}>换键</button>
                  <button type="button" disabled={!!capture || !player.bindings[action.id]?.length} onClick={() => updatePlayer(index, { ...player, bindings: { ...player.bindings, [action.id]: [] } })} aria-label={`清除玩家 ${index + 1} ${action.label}键位`}>清除</button>
                </>}
              </div>
            </div>)}
          </div>
          <button type="button" disabled={!!capture} onClick={() => updatePlayer(index, { ...player, bindings: standard ? defaultBindings(definition) : Object.fromEntries(definition.actions.map(a => [a.id, []])) })}>{standard ? "恢复这位玩家的默认键位" : "清空这位玩家的键位"}</button>
        </fieldset>;
      })}
    </details>}
    {showDetails && capture && <div className="controller-capture" role="status">
      <strong>玩家 {capture.player + 1} · {definition.actions.find(a => a.id === capture.action)?.label}</strong>
      <p>{capture.ready ? "现在按想使用的键，或推动摇杆方向。" : "先松开所有按键，让摇杆回到中间。"}</p>
      <button type="button" onClick={session.cancelCapture}>取消换键（Escape）</button>
    </div>}
    {showDetails && session.notice && <p role="status">{session.notice}</p>}
    {showStatus && <div className={`controller-save ${saved.status.endsWith("error") ? "controller-error" : ""}`} role="status">
      <span>{saved.message}</span>{saved.status.endsWith("error") && <button type="button" disabled={lockPlayerCount && saved.status === "read-error"} onClick={() => void session.retry()}>{saved.status === "read-error" ? lockPlayerCount ? "本局结束后重试读取" : "重试读取并保存选择" : "重试保存"}</button>}
    </div>}
  </section>;
}
