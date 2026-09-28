import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { loadPersistentData, queuePersistentDataWrite } from "../../shared/persistent-data";
import { BOARD_SIZES, TILE_STYLES, boardTotal, canMove, move, newGame, newState, parse2048, tileValue, type BoardSize, type Direction, type State2048 } from "./logic";
import "./game-2048.css";

const ID = "math-2048";
type Traveller = { from: number; to: number; power: number; dx: number; dy: number; leading: boolean };
type MoveEffect = { turn: number; merged: number[]; travellers: Traveller[] };
function tileStyle(power: number): CSSProperties {
  const colours = TILE_STYLES[Math.min(power, 20) - 1];
  return colours ? { "--tile-bg": colours[0], "--tile-ink": colours[1] } as CSSProperties : {};
}
function TileNumber({ power }: { power: number }) {
  const text = tileValue(power);
  return <svg viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="52" textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(46, 144 / Math.max(3, text.length))}>{text}</text></svg>;
}
const arrows: { direction: Direction; label: string; icon: string }[] = [
  { direction: "left", label: "向左", icon: "←" }, { direction: "up", label: "向上", icon: "↑" },
  { direction: "down", label: "向下", icon: "↓" }, { direction: "right", label: "向右", icon: "→" },
];

export function Game2048Page() {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const fullscreen = useGameFullscreen(root);
  const [state, setState] = useState<State2048>();
  const current = useRef<State2048 | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [notice, setNotice] = useState("滑动棋盘，或按方向键合并相同数字");
  const [effect, setEffect] = useState<MoveEffect>({ turn: 0, merged: [], travellers: [] });
  const [totalGains, setTotalGains] = useState<{ id: number; value: string }[]>([]);
  const gainId = useRef(0);
  const revision = useRef(0);
  const mounted = useRef(true);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(2000);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);

  const persist = useCallback(function save(next: State2048) {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    const version = ++revision.current;
    void queuePersistentDataWrite(ID, next, parse2048, (input, init) => fetch(input, { ...init, keepalive: true })).then(result => {
      if (!mounted.current || revision.current !== version) return;
      retryDelay.current = 2000;
      // The server preserves historical records even across multiple open tabs.
      current.current = result.payload; setState(result.payload);
    }).catch(() => {
      if (!mounted.current || revision.current !== version) return;
      // Retry the newest snapshot silently, without blocking input or navigation.
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        if (current.current) save(current.current);
      }, retryDelay.current);
      retryDelay.current = Math.min(retryDelay.current * 2, 30000);
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    void loadPersistentData({ stableId: ID, parsePayload: parse2048 }).then(result => {
      if (cancelled) return;
      const next = result?.payload ?? newState();
      current.current = next; setState(next);
      if (!result) persist(next);
    }).catch(() => { if (!cancelled) setLoadError("暂时无法读取进度，原来的记录会保留。请重试。"); });
    return () => { cancelled = true; };
  }, [loadAttempt, persist]);

  const commit = useCallback((next: State2048) => {
    current.current = next; setState(next); persist(next);
  }, [persist]);

  const play = useCallback((direction: Direction) => {
    const previous = current.current;
    if (!previous || dialog.current?.open) return;
    const size = previous.activeSize;
    const result = move(previous.games[size], size, direction);
    if (result.game === previous.games[size]) return;
    // Merging conserves the board sum; only the newly spawned tile increases it.
    const added = BigInt(boardTotal(result.game.cells)) - BigInt(boardTotal(previous.games[size].cells));
    if (added > 0n) {
      const gain = { id: ++gainId.current, value: added.toString() };
      setTotalGains(gains => [...gains, gain]);
    }
    // Read the old visual positions once, before React updates the board. This
    // also samples in-flight transforms, so rapid input can smoothly retarget.
    const slots = new Map<number, DOMRect>();
    board.current?.querySelectorAll<HTMLElement>("[data-cell]").forEach(element => {
      slots.set(Number(element.dataset.cell), element.getBoundingClientRect());
    });
    const origins = new Map(slots);
    board.current?.querySelectorAll<HTMLElement>('[data-leading="true"]').forEach(element => {
      if (element.getClientRects().length) origins.set(Number(element.dataset.arrival), element.getBoundingClientRect());
    });
    const arrivals = new Set<number>();
    const travellers = result.movements.map(movement => {
      const origin = origins.get(movement.from), destination = slots.get(movement.to);
      const leading = !arrivals.has(movement.to);
      arrivals.add(movement.to);
      return { ...movement, leading, dx: origin && destination ? origin.x - destination.x : 0, dy: origin && destination ? origin.y - destination.y : 0 };
    });
    commit({ ...previous, games: { ...previous.games, [size]: result.game } });
    setEffect(value => ({ turn: value.turn + 1, merged: result.merged, travellers }));
    setNotice(result.gained !== "0" ? `合并成功，加 ${result.gained} 分` : "继续寻找相同的数字");
  }, [commit]);

  useEffect(() => {
    const keys: Record<string, Direction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down" };
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.metaKey || event.ctrlKey || event.repeat || dialog.current?.open) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(target.tagName))) return;
      const direction = keys[event.key] ?? keys[event.key.toLowerCase()];
      if (direction) { event.preventDefault(); play(direction); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play]);

  const switchSize = (size: BoardSize) => {
    if (!current.current || current.current.activeSize === size) return;
    commit({ ...current.current, activeSize: size });
    setTotalGains([]);
    setEffect(value => ({ turn: value.turn + 1, merged: [], travellers: [] }));
    setNotice(`已恢复 ${size} × ${size} 棋盘`);
  };
  const restart = () => {
    const previous = current.current;
    if (!previous) return;
    const size = previous.activeSize;
    commit({ ...previous, games: { ...previous.games, [size]: newGame(size, previous.games[size].best) } });
    setTotalGains([]);
    setEffect(value => ({ turn: value.turn + 1, merged: [], travellers: [] }));
    setNotice("新棋盘准备好了"); dialog.current?.close(); board.current?.focus();
  };
  const size = state?.activeSize ?? 4;
  const game = state?.games[size];
  const stopped = game ? !canMove(game, size) : false;
  const peak = game ? tileValue(Math.max(...game.cells)) : "2";
  const total = game ? boardTotal(game.cells) : "0";

  return <div ref={root} className={`game2048 ${fullscreen.focused ? "game2048--fullscreen" : ""}`} data-skip-startup-greeting>
    {!fullscreen.focused && <GameTopBar title="2048" backHref="/?tab=math" backLabel="数学" />}
    <main className="game2048__main">
      <div className="game2048__toolbar">
        <div className="game2048__sizes" role="group" aria-label="棋盘大小，各自保留进度">
          {BOARD_SIZES.map(value => <button key={value} disabled={!state} aria-pressed={size === value} onClick={() => switchSize(value)}>{size === value ? "✓ " : ""}{value}×{value}</button>)}
        </div>
        <div className="game2048__actions">
          <button disabled={!state} onClick={() => dialog.current?.showModal()}>新一局</button>
          <button data-fullscreen-exit={fullscreen.focused || undefined} disabled={fullscreen.switching} onClick={() => void (fullscreen.focused ? fullscreen.leave() : fullscreen.enter())}>{fullscreen.focused ? "退出全屏" : "全屏"}</button>
        </div>
      </div>
      {!state ? <div className="game2048__loading" role="status">{loadError || "正在恢复你的棋盘…"}{loadError && <button onClick={() => setLoadAttempt(n => n + 1)}>重新读取</button>}</div> : game && <>
        <div className="game2048__scores">
          <div><span>本局分数</span><strong title={game.score}>{game.score}</strong></div>
          <div>
            <span>牌面总值</span>
            <div className="game2048__total-number">
              <strong title={total} aria-label={`牌面总值 ${total}`}>{total}</strong>
              {totalGains.map(gain => <span key={gain.id} className="game2048__total-gain" aria-hidden="true"
                style={{ "--gain-offset": `${((gain.id - 1) % 3 - 1) * 10}px` } as CSSProperties}
                onAnimationEnd={() => setTotalGains(gains => gains.filter(item => item.id !== gain.id))}>+{gain.value}</span>)}
            </div>
          </div>
          <div><span title={`${size}×${size} 最高分`}>最高分</span><strong title={game.best}>{game.best}</strong></div>
          <div><span>最大方块</span><strong title={peak}>{peak}</strong></div>
        </div>
        <div className="game2048__stage">
          <div ref={board} className="game2048__board" tabIndex={0} role="group" aria-label={`${size}乘${size}棋盘，使用方向键或滑动合并`} style={{ "--board-size": size } as CSSProperties}
            onPointerDown={event => {
              if (!event.isPrimary || event.button !== 0) return;
              gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
              event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true });
            }}
            onPointerCancel={() => { gesture.current = null; }}
            onLostPointerCapture={() => { gesture.current = null; }}
            onPointerUp={event => {
              const start = gesture.current; gesture.current = null;
              if (!start || start.id !== event.pointerId) return;
              const dx = event.clientX - start.x, dy = event.clientY - start.y;
              if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
              play(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up");
            }}>
            {game.cells.map((power, index) => {
              const text = power ? tileValue(power) : "";
              const arrived = effect.travellers.some(tile => tile.to === index);
              const animated = effect.travellers.length > 0;
              return <div key={index} data-cell={index} className="game2048__cell" style={{ gridRow: Math.floor(index / size) + 1, gridColumn: index % size + 1 }} aria-label={`第${Math.floor(index / size) + 1}行第${index % size + 1}列，${text || "空格"}`}>
                {power > 0 && <div key={effect.turn} className={`game2048__tile is-filled ${animated ? arrived ? effect.merged.includes(index) ? "is-arriving is-merged" : "is-arriving" : "is-new" : ""}`} style={tileStyle(power)}><TileNumber power={power} /></div>}
              </div>;
            })}
            {effect.travellers.map(tile => <div key={`${effect.turn}:${tile.from}`} className="game2048__tile is-filled game2048__traveller" aria-hidden="true" data-arrival={tile.to} data-leading={tile.leading}
              style={{ ...tileStyle(tile.power), gridRow: Math.floor(tile.to / size) + 1, gridColumn: tile.to % size + 1, "--travel-x": `${tile.dx}px`, "--travel-y": `${tile.dy}px` } as CSSProperties}><TileNumber power={tile.power} /></div>)}
          </div>
        </div>
        <div className="game2048__footer">
          <div className="game2048__directions" role="group" aria-label="移动方块">{arrows.map(({ direction, label, icon }) => <button key={direction} disabled={stopped} onClick={() => play(direction)} aria-label={label}><span aria-hidden="true">{icon}</span><span>{label}</span></button>)}</div>
          <div className="game2048__messages">
            <p role="status">{stopped ? "这一盘已经填满啦，试试新一局或另一种大小" : notice}</p>
            <p>新方块：{tileValue(game.spawnPower)} / {tileValue(game.spawnPower + 1)} · 一直合并，无终点</p>
          </div>
        </div>
      </>}
    </main>
    <dialog ref={dialog} className="game2048__dialog" aria-labelledby="game2048-reset-title" onClose={() => board.current?.focus()}>
      <h2 id="game2048-reset-title">重新开始 {size}×{size}？</h2>
      <p>这一盘会清空，历史最高分和其他大小的棋盘会保留。</p>
      <div><button autoFocus onClick={() => dialog.current?.close()}>接着玩</button><button onClick={restart}>开始新一局</button></div>
    </dialog>
  </div>;
}
