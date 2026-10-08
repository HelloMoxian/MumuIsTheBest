import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { audioFocus } from "../../shared/audio/audio-focus";
import { browserTts } from "../../shared/speech";
import { getExperienceSnapshot, subscribeExperience } from "../../shared/experience/experience-store";
import { useAudioPreferences } from "../../shared/audio/audio-store";
import { GomokuAudio, QUIET_TRACKS, type QuietTrack } from "./audio";
import { SIZE, moveCursor, newGame, place } from "./logic";
import "./gomoku.css";

const points = Array.from({ length: SIZE }, (_, i) => 40 + i * 40);
const xy = (index: number) => ({ x: 40 + (index % SIZE) * 40, y: 40 + Math.floor(index / SIZE) * 40 });
const side = (stone: number) => stone === 1 ? "黑方" : "白方";

export function GomokuGame() {
  const root = useRef<HTMLDivElement>(null), board = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const modal = useRef<HTMLDialogElement>(null), restartButton = useRef<HTMLButtonElement>(null);
  const fullscreen = useGameFullscreen(root);
  const [game, setGame] = useState(newGame);
  const live = useRef(game);
  const [cursor, setCursor] = useState(112);
  const cursorRef = useRef(112);
  const [round, setRound] = useState(1);
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState<QuietTrack>("off");
  const musicChosen = useRef(false);
  const globalAudio = useAudioPreferences();
  const [opening, setOpening] = useState(true);
  const [celebrating, setCelebrating] = useState(false);
  const [active, setActive] = useState(true);
  const [notice, setNotice] = useState("");
  const [visible, setVisible] = useState(!document.hidden);
  const audio = useRef<GomokuAudio | null>(null);
  const lastAction = useRef(-Infinity);
  const finishedAt = useRef(-Infinity);
  const done = game.winning.length > 0 || game.draw;
  const selected = xy(cursor), last = game.moves.at(-1);
  const occupied = Boolean(game.cells[cursor]);
  const status = game.winning.length ? side(game.turn) + "获胜！" : game.draw ? "平局，一起再来！" : side(game.turn) + (game.moves.length ? "落子" : "先手");

  useEffect(() => {
    if (!musicChosen.current && globalAudio.ready) {
      musicChosen.current = true;
      setMusic(globalAudio.preferences.musicEnabled ? "moon" : "off");
    }
  }, [globalAudio.ready, globalAudio.preferences.musicEnabled]);
  useEffect(() => { audio.current?.configureMusic(music); }, [music]);
  useEffect(() => {
    if (!opening || !visible || !active) return;
    const timer = window.setTimeout(() => setOpening(false), 2100);
    return () => window.clearTimeout(timer);
  }, [opening, round, visible, active]);
  useEffect(() => {
    if (!celebrating || !visible || !active) return;
    const timer = window.setTimeout(() => setCelebrating(false), 2400);
    return () => window.clearTimeout(timer);
  }, [celebrating, visible, active]);

  useEffect(() => {
    const effects = new GomokuAudio(() => setNotice("声音暂不可用，可以继续下棋"));
    audio.current = effects;
    effects.configureMusic(music);
    const sync = () => {
      setVisible(!document.hidden);
      const focused = document.hasFocus();
      setActive(focused);
      const tts = browserTts.getSnapshot().status;
      effects.setBlocked(document.hidden || !focused || audioFocus.isMicrophoneActive()
        || tts === "speaking" || tts === "loading" || getExperienceSnapshot().speechStatus.startsWith("speaking"));
    };
    const cleanups = [audioFocus.subscribe(sync), browserTts.subscribe(sync), subscribeExperience(sync)];
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    return () => {
      effects.dispose(); audio.current = null; cleanups.forEach(cleanup => cleanup());
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  function select(index: number) {
    cursorRef.current = index; setCursor(index); setNotice("");
  }
  function move(dr: number, dc: number) {
    select(moveCursor(cursorRef.current, dr, dc));
  }
  function drop(index: number) {
    if (document.hidden || modal.current?.open || performance.now() - lastAction.current < 180) return;
    const previous = live.current, next = place(previous, index);
    if (next === previous) {
      if (!previous.winning.length && !previous.draw) setNotice("这里有棋子啦，换一个交叉点");
      return;
    }
    lastAction.current = performance.now();
    live.current = next; setGame(next); setNotice(""); setOpening(false);
    if (sound) audio.current?.playStone(previous.turn === 1);
    if (next.winning.length || next.draw) {
      finishedAt.current = performance.now();
      if (next.winning.length) setCelebrating(true);
    }
  }
  function restart() {
    const next = newGame();
    live.current = next; setGame(next); setRound(n => n + 1); select(112);
    audio.current?.stopEffects(); setOpening(true); setCelebrating(false);
    lastAction.current = performance.now();
    modal.current?.close();
    board.current?.focus({ preventScroll: true });
  }
  function requestRestart() {
    if (done || !game.moves.length) restart();
    else { audio.current?.stopEffects(); modal.current?.showModal(); }
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || modal.current?.open) return;
    const direction: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] };
    const delta = direction[event.key];
    if (delta) { event.preventDefault(); if (!done) move(...delta); }
    else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return;
      if (done) { if (performance.now() - finishedAt.current > 700) restart(); }
      else drop(cursorRef.current);
    }
  }
  function pointerIndex(event: { clientX: number; clientY: number }) {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return null;
    const col = Math.round(((event.clientX - rect.left) / rect.width * 640 - 40) / 40);
    const row = Math.round(((event.clientY - rect.top) / rect.height * 640 - 40) / 40);
    return col >= 0 && col < SIZE && row >= 0 && row < SIZE ? row * SIZE + col : null;
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (done || event.pointerType === "touch") return;
    const index = pointerIndex(event);
    if (index !== null && index !== cursorRef.current) select(index);
  }

  return <div ref={root} className={"gomoku" + (fullscreen.focused ? " gomoku--fullscreen" : "") + (!visible || !active ? " gomoku--hidden" : "") + (opening ? " is-opening" : "") + (game.winning.length ? " has-winner" : "")} data-skip-startup-greeting
    onPointerDownCapture={() => audio.current?.unlock()} onKeyDownCapture={() => audio.current?.unlock()}>
    <GameTopBar title="五子棋" wallets={false} controls={<>
      <select className="gomoku__music" aria-label="安静配乐" value={music} onChange={event => {
        const value = event.target.value;
        if (value !== "off" && !QUIET_TRACKS.some(track => track.id === value)) return;
        musicChosen.current = true; setMusic(value as QuietTrack);
        audio.current?.configureMusic(value as QuietTrack); audio.current?.unlock();
      }}>
        {QUIET_TRACKS.map(track => <option key={track.id} value={track.id}>♫ {track.title}</option>)}
        <option value="off">配乐：关闭</option>
      </select>
      <button aria-pressed={sound} onClick={() => { setSound(!sound); audio.current?.stopEffects(); }}>{sound ? "音效：开" : "音效：关"}</button>
      <button disabled={fullscreen.switching} data-fullscreen-exit={fullscreen.focused || undefined} onClick={() => void (fullscreen.focused ? fullscreen.leave() : fullscreen.enter())}>{fullscreen.focused ? "退出全屏" : "全屏"}</button>
    </>} />
    <main className="gomoku__main">
      <div className={"gomoku__turn" + (done ? " is-finished" : "")}>
        {game.winning.length > 0 && <svg className="gomoku__laurel" viewBox="0 0 100 80" aria-hidden="true"><path d="M37 69C9 52 10 25 25 10M63 69C91 52 90 25 75 10" /><path d="M24 51Q7 53 9 37Q23 35 24 51M19 34Q4 29 12 17Q24 21 19 34M23 20Q16 5 30 3Q35 14 23 20M76 51Q93 53 91 37Q77 35 76 51M81 34Q96 29 88 17Q76 21 81 34M77 20Q84 5 70 3Q65 14 77 20" /><path d="m50 20 5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1Z" /></svg>}
        <span aria-hidden="true" className={"gomoku__turn-stone " + (game.turn === 1 ? "is-black" : "is-white")} />
        <div><strong role="status">{status}</strong><span>第 {round} 局 · {game.moves.length} 手{!game.moves.length ? " · 连成五子获胜" : ""}</span></div>
        <button ref={restartButton} className={done ? "gomoku__primary" : ""} onClick={requestRestart}>{done ? "下一局" : "重新开局"}</button>
      </div>
      <div className="gomoku__stage">
        <div ref={board} className={"gomoku__board" + (done ? " is-finished" : "")} tabIndex={0} role="application" data-gamepad-surface
          aria-label={"五子棋棋盘，方向键移动，空格落子"} aria-describedby="gomoku-position"
          onKeyDown={onKeyDown} onPointerMove={pointerMove} onClick={event => {
            if (done) return;
            const index = pointerIndex(event);
            if (index !== null) { board.current?.focus({ preventScroll: true }); select(index); drop(index); }
          }}>
          <svg ref={svg} viewBox="0 0 640 640" aria-label="15 行 15 列五子棋棋盘" role="img">
            <defs>
              <radialGradient id="gomoku-black" cx="32%" cy="25%" r="75%"><stop stopColor="#5a6173" /><stop offset=".45" stopColor="#202431" /><stop offset="1" stopColor="#080b13" /></radialGradient>
              <radialGradient id="gomoku-white" cx="32%" cy="25%" r="75%"><stop stopColor="#fff" /><stop offset=".55" stopColor="#f5f5ff" /><stop offset="1" stopColor="#b8b7d7" /></radialGradient>
            </defs>
            <g key={"grid-" + round} className="gomoku__lines">{points.map((p, i) => <path key={p} pathLength="1" style={{ "--line-delay": i * 25 + "ms" } as CSSProperties} d={`M40 ${p} H600 M${p} 40 V600`} />)}</g>
            <g className="gomoku__stars">{[48, 56, 112, 168, 176].map(i => <circle key={i} {...{ cx: xy(i).x, cy: xy(i).y }} r="4" />)}</g>
            <g className="gomoku__coordinates">{points.map((p, i) => <g key={p}><text x={p} y="22">{String.fromCharCode(65 + i)}</text><text x="19" y={p + 6}>{15 - i}</text></g>)}</g>
            {game.cells.map((stone, index) => {
              if (!stone) return null;
              const position = xy(index), win = game.winning.includes(index);
              return <g key={round + "-" + index} transform={`translate(${position.x} ${position.y})`} className={done && game.winning.length && !win ? "gomoku__muted" : ""}>
                <title>{String.fromCharCode(65 + index % SIZE)}{15 - Math.floor(index / SIZE)}，{side(stone)}棋子{win ? "，获胜连线" : ""}</title>
                <g className="gomoku__placed"><circle r="17.5" fill={stone === 1 ? "url(#gomoku-black)" : "url(#gomoku-white)"} className="gomoku__stone" />
                  {index === last && <circle r="3.5" className="gomoku__last" />}
                </g>
                {win && <g style={{ "--win-delay": game.winning.indexOf(index) * 130 + "ms" } as CSSProperties}>
                  <circle r="21" className="gomoku__winning" />
                  {celebrating && <><circle r="20" className="gomoku__win-wave" /><circle r="26" className="gomoku__win-wave gomoku__win-wave--outer" /></>}
                </g>}
              </g>;
            })}
            {game.winning.length > 0 && <line pathLength="1" className="gomoku__win-line" x1={xy(game.winning[0]).x} y1={xy(game.winning[0]).y} x2={xy(game.winning[4]).x} y2={xy(game.winning[4]).y} />}
            {!done && <g transform={`translate(${selected.x} ${selected.y})`} className="gomoku__cursor">
              <circle r="24" className="gomoku__target" />
              <g transform={occupied ? "translate(19 -19)" : undefined}><circle r={occupied ? 16 : 21} fill={game.turn === 1 ? "url(#gomoku-black)" : "url(#gomoku-white)"} className="gomoku__ghost" /></g>
            </g>}
          </svg>
          {opening && <div key={round} className="gomoku__opening" aria-hidden="true">
            <div className="gomoku__opening-ring" /><div className="gomoku__opening-stones"><span className="gomoku__turn-stone is-black" /><span className="gomoku__turn-stone is-white" /></div>
            <strong>黑方先手</strong><span>一起下盘好棋</span>
          </div>}
          {celebrating && <div className="gomoku__celebration" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{
            "--spark-x": (i % 2 ? 100 : 0) + "%", "--spark-y": (30 + (i % 7) * 8) + "%",
            "--spark-dx": ((i % 2 ? -1 : 1) * (40 + (i * 37) % 180)) + "px",
            "--spark-dy": (-80 - (i * 23) % 150) + "px", "--spark-delay": (i % 7) * 70 + "ms",
          } as CSSProperties} />)}</div>}
        </div>
      </div>
      <div className="gomoku__bottom">
        <p id="gomoku-position" aria-live="polite">{notice || (done ? "看看这盘好棋，准备好了就开始下一局" : `落点 ${String.fromCharCode(65 + cursor % SIZE)}${15 - Math.floor(cursor / SIZE)} · ${occupied ? "已有棋子，请换一处" : side(game.turn) + "请落子"}`)}</p>
        <div className="gomoku__touch" aria-label="移动落点">
          <button aria-label="向左移动落点" onClick={() => move(0, -1)} disabled={done}>←</button>
          <button aria-label="向上移动落点" onClick={() => move(-1, 0)} disabled={done}>↑</button>
          <button aria-label="向下移动落点" onClick={() => move(1, 0)} disabled={done}>↓</button>
          <button aria-label="向右移动落点" onClick={() => move(0, 1)} disabled={done}>→</button>
          <button className="gomoku__primary" disabled={done || occupied} onClick={() => drop(cursorRef.current)}>落子</button>
        </div>
        <p className="gomoku__help">点击落子 · 方向键移动 / 空格确认 · 手柄 A 落子 / B 退出操控</p>
      </div>
    </main>
    <dialog ref={modal} className="gomoku__dialog" aria-labelledby="gomoku-restart-title" onClose={() => { if (!board.current?.contains(document.activeElement)) restartButton.current?.focus(); }} onKeyDown={event => event.stopPropagation()}>
      <h2 id="gomoku-restart-title">重新开一局？</h2><p>这盘棋会清空，黑方重新先手。</p>
      <div><button autoFocus onClick={() => modal.current?.close()}>接着下</button><button className="gomoku__primary" onClick={restart}>重新开局</button></div>
    </dialog>
  </div>;
}
