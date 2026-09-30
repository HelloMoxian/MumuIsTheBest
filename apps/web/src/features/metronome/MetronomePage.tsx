import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { audioFocus } from "../../shared/audio/audio-focus";
import { stopLearningSpeech } from "../../shared/experience/learning-speech";
import { browserTts } from "../../shared/speech";
import { MusicAudio, type Voice } from "./audio";
import { INSTRUMENTS, RHYTHMS, KEYS, getInstrument, getRhythm, keyLabel, canChord, type Instrument } from "./catalog";
import { InstrumentIcon, StepEditor, ToolButton, TrackStrip } from "./components";
import {
  MAX_TRACKS, MAX_PROJECTS, TICKS, addTrack, canAddNotes, changePreset, cloneProject, createLibrary, createProject, createTrack, deleteProject,
  CLICK_LABELS, nextClickLevel, parseMusicLibrary, placeStepNote, projectTicks, RecordingTake, resizeLoop, stepTick, updateStepNote,
  type InstrumentId, type MusicLibrary, type MusicNote, type MusicProject, type MusicTrack,
} from "./logic";
import { loadMusic, MusicSaveQueue, type SaveStatus } from "./persistence";
import { COUNT_IN_BARS, LoopTransport, STOPPED, type TransportFrame } from "./transport";
import "./metronome.css";

type Modal = "instruments" | "rhythms" | "settings" | "works" | "export" | "confirm" | null;
type ManualEdit = { projectId: string; trackId: string; tick: number; noteId: string | null };
type LiveKey = { key: number; voice?: Voice };
const messageOf = (error: unknown) => error instanceof Error ? error.message : "暂时没有完成，请重试。";
const FAVORITES: InstrumentId[] = ["piano", "guitar", "violin", "flute", "drum-kit", "marimba", "sax", "hand-drums"];
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const safeName = (title: string) => title.replace(/[\\/:*?"<>|]/g, "-") + "-" + new Date().toISOString().replace(/[:.]/g, "-");
export function MetronomePage() {
  const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const fullscreen = useGameFullscreen(root);
  const [library, setLibrary] = useState<MusicLibrary>(createLibrary);
  const libraryRef = useRef(library);
  const [ready, setReady] = useState(false), readyRef = useRef(false);
  const [loadError, setLoadError] = useState(""), [notice, setNotice] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved"), [saveError, setSaveError] = useState("");
  const [frame, setFrame] = useState<TransportFrame>(STOPPED), [taking, setTaking] = useState(false);
  const [busy, setBusy] = useState(""), [pressed, setPressed] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<Modal>(null), [family, setFamily] = useState("常用");
  const [pickerMode, setPickerMode] = useState<"add" | "replace">("add");
  const [confirmText, setConfirmText] = useState(""), confirmAction = useRef<(() => void) | null>(null);
  const [exportRepeats, setExportRepeats] = useState(2), [reduced, setReduced] = useState(false);
  const [historyLength, setHistoryLength] = useState(0);
  const [manualEdit, setManualEdit] = useState<ManualEdit | null>(null), manualRef = useRef<ManualEdit | null>(null);
  const undoStack = useRef<MusicProject[]>([]), liveKeys = useRef(new Map<string, LiveKey>());
  const engine = useRef<MusicAudio | null>(null), transport = useRef<LoopTransport | null>(null), take = useRef<RecordingTake | null>(null);
  const saver = useRef<MusicSaveQueue | null>(null), generation = useRef(0), mounted = useRef(true);
  const actions = useRef({ stop: () => {}, release: (_token: string) => {}, finishTake: (_tick: number) => {}, press: (_token: string, _key: number) => {}, start: (_record = false) => {} });
  const currentProject = () => libraryRef.current.projects.find(p => p.id === libraryRef.current.activeId)!;
  const project = library.projects.find(p => p.id === library.activeId)!;
  const selected = project.tracks.find(t => t.id === project.activeTrackId);
  const displayProject = take.current ? take.current.merge(project, Math.max(0, frame.absoluteTick)) : project;
  const rhythm = getRhythm(project.preset), running = frame.phase !== "stopped";
  const recording = taking || frame.phase === "countin" || frame.phase === "recording";
  const editing = manualEdit?.projectId === project.id && manualEdit.trackId === selected?.id ? manualEdit : null;
  function setEditing(next: ManualEdit | null) { manualRef.current = next; setManualEdit(next); }

  function commitLibrary(next: MusicLibrary) {
    if (!readyRef.current) return false;
    const valid = parseMusicLibrary(next);
    if (!valid) { setNotice("这份作品已经很丰富了，可以另存一份继续。"); return false; }
    libraryRef.current = valid; setLibrary(valid); saver.current?.enqueue(valid);
    return true;
  }
  function changeProject(update: MusicProject | ((p: MusicProject) => MusicProject), remember = true) {
    const old = currentProject(), next = typeof update === "function" ? update(old) : update;
    if (next === old) return false;
    const changed = { ...next, updatedAt: new Date().toISOString() };
    const result = commitLibrary({ ...libraryRef.current, projects: libraryRef.current.projects.map(p => p.id === old.id ? changed : p) });
    if (result && remember) { undoStack.current.push(old); if (undoStack.current.length > 40) undoStack.current.shift(); setHistoryLength(undoStack.current.length); }
    return result;
  }
  function changeTrack(id: string, patch: Partial<MusicTrack>, remember = true) {
    return changeProject(p => ({ ...p, tracks: p.tracks.map(t => t.id === id ? { ...t, ...patch } : t) }), remember);
  }
  function release(token: string) {
    const held = liveKeys.current.get(token);
    if (!held) return;
    held.voice?.release(); liveKeys.current.delete(token);
    take.current?.release(token, transport.current?.position() ?? 0);
    setPressed(new Set([...liveKeys.current.values()].map(h => h.key)));
  }
  function finishTake(tick: number) {
    const recorded = take.current;
    if (!recorded) return;
    for (const token of [...recorded.held.keys()]) recorded.release(token, Math.min(tick, projectTicks(recorded.project)));
    take.current = null; setTaking(false);
    if (recorded.notes.length) changeProject(recorded.merge(currentProject(), tick));
  }
  function stop() {
    generation.current++;
    for (const token of [...liveKeys.current.keys()]) release(token);
    finishTake(transport.current?.position() ?? 0);
    transport.current?.stop(); engine.current?.stopAll();
    setBusy("");
  }
  async function start(record = false, replace = false) {
    if (!readyRef.current || dialog.current?.open) return;
    stop(); const id = ++generation.current;
    const p = currentProject();
    if (record && !p.activeTrackId) return;
    if (record) setEditing(null);
    setNotice(""); setBusy("正在准备音色…");
    stopLearningSpeech(); browserTts.stop();
    try {
      await engine.current!.prepare(p);
      if (id !== generation.current || !mounted.current || document.hidden) return;
      engine.current!.setVolume(p.volume);
      if (record) { take.current = new RecordingTake(p, p.activeTrackId!, replace); setTaking(true); }
      setBusy(""); transport.current!.start(record);
    } catch (error) { if (id === generation.current && mounted.current) { setBusy(""); setNotice(messageOf(error)); } }
  }
  async function press(token: string, key: number) {
    if (!readyRef.current || dialog.current?.open || liveKeys.current.has(token)) return;
    const p = currentProject(), track = p.tracks.find(t => t.id === p.activeTrackId);
    if (!track) return;
    const identity = generation.current;
    const held: LiveKey = { key }; liveKeys.current.set(token, held);
    setPressed(new Set([...liveKeys.current.values()].map(h => h.key)));
    // Step entry is synchronous and independent of sample loading or finger timing.
    if (!transport.current?.running && !take.current && manualRef.current?.projectId === p.id && manualRef.current.trackId === track.id) insertStep(key);
    try {
      const instrument = getInstrument(track.instrument);
      if (!engine.current!.ready(instrument)) {
        setBusy("正在准备音色…"); await engine.current!.prepareInstrument(instrument);
        if (identity === generation.current && mounted.current) setBusy("");
      } else await engine.current!.unlock();
      if (identity !== generation.current || liveKeys.current.get(token) !== held || document.hidden) return;
      engine.current!.setVolume(p.volume);
      held.voice = engine.current!.playKey(track, p, key);
      const recorded = take.current;
      if (recorded) {
        const originalTrack = recorded.project.tracks.find(t => t.id === recorded.trackId)!;
        const count = recorded.notes.length + recorded.held.size + 1 - (recorded.replace ? originalTrack.notes.length : 0);
        if (canAddNotes(libraryRef.current, recorded.project, originalTrack, count)) recorded.press(token, key, transport.current!.position());
        else setNotice("这条音轨已经很满了，可以再加一种乐器。");
      }
    } catch (error) { release(token); if (mounted.current) { setBusy(""); setNotice(messageOf(error)); } }
  }
  actions.current = { stop, release, finishTake, press: (token, key) => { void press(token, key); }, start: record => { void start(record); } };

  async function load() {
    setLoadError(""); setReady(false); readyRef.current = false;
    try {
      const stored = await loadMusic();
      if (!mounted.current) return;
      const next = stored?.library ?? createLibrary();
      libraryRef.current = next; setLibrary(next);
      saver.current = new MusicSaveQueue(stored?.revision ?? 0, (status, error) => {
        if (mounted.current) { setSaveStatus(status); setSaveError(error ?? ""); }
      });
      readyRef.current = true; setReady(true);
      if (!stored) saver.current.enqueue(next);
    } catch (error) { if (mounted.current) setLoadError(messageOf(error)); }
  }
  useEffect(() => {
    mounted.current = true; engine.current = new MusicAudio();
    const releaseCreative = audioFocus.acquireCreative();
    stopLearningSpeech(); browserTts.stop();
    transport.current = new LoopTransport({
      now: () => engine.current!.now,
      project: through => take.current ? take.current.merge(currentProject(), through) : currentProject(),
      schedule: (event, when, seconds) => engine.current!.schedule(event, when, seconds, currentProject()),
      frame: next => { if (mounted.current) setFrame(next); },
      finishRecording: () => actions.current.finishTake(projectTicks(currentProject())),
      interrupted: () => { actions.current.stop(); setNotice("播放已暂停，刚才录下的音符已保留。"); },
      suppress: () => {
        const recorded = take.current;
        return new Set(recorded ? [...recorded.notes.map(n => n.id), ...[...recorded.held.values()].map(h => h.id),
          ...(recorded.replace ? recorded.project.tracks.find(t => t.id === recorded.trackId)!.notes.map(n => n.id) : [])] : []);
      },
    });
    void load();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const reduce = () => setReduced(media.matches); reduce(); media.addEventListener("change", reduce);
    const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest("input, textarea, select, [contenteditable='true']");
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || editable(event.target) || dialog.current?.open) return;
      const match = /^Digit(\d)$/.exec(event.code);
      if (match) { event.preventDefault(); actions.current.press("key-" + event.code, (Number(match[1]) + 9) % 10); }
      else if (event.code === "Space" && !(event.target instanceof Element && event.target.closest("button,a"))) {
        event.preventDefault(); if (transport.current?.running) actions.current.stop(); else actions.current.start(false);
      }
    };
    const keyup = (event: KeyboardEvent) => actions.current.release("key-" + event.code);
    const blur = () => { for (const token of [...liveKeys.current.keys()]) actions.current.release(token); };
    const hidden = () => { if (document.hidden) actions.current.stop(); };
    const unload = (event: BeforeUnloadEvent) => {
      if (take.current) actions.current.stop();
      if (saver.current?.dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    document.addEventListener("keydown", keydown); document.addEventListener("keyup", keyup);
    document.addEventListener("visibilitychange", hidden); window.addEventListener("blur", blur);
    window.addEventListener("pagehide", actions.current.stop); window.addEventListener("beforeunload", unload);
    const microphone = audioFocus.subscribe(() => { if (audioFocus.isMicrophoneActive()) actions.current.stop(); });
    const onPageHide = actions.current.stop;
    return () => {
      actions.current.stop(); mounted.current = false; readyRef.current = false;
      engine.current?.dispose(); transport.current = null; releaseCreative(); microphone();
      media.removeEventListener("change", reduce); document.removeEventListener("keydown", keydown); document.removeEventListener("keyup", keyup);
      document.removeEventListener("visibilitychange", hidden); window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", onPageHide); window.removeEventListener("beforeunload", unload);
    };
  }, []);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
  }, [modal]);
  function openModal(next: Modal) {
    stop(); opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice(""); setModal(next);
  }
  function closeModal() { generation.current++; engine.current?.stopAll(); setBusy(""); dialog.current?.close(); setModal(null); }
  function confirm(text: string, action: () => void) {
    confirmAction.current = action; setConfirmText(text); openModal("confirm");
  }
  function choosePicker(mode: "add" | "replace") { setPickerMode(mode); setFamily("常用"); openModal("instruments"); }
  async function chooseInstrument(instrument: Instrument) {
    const id = ++generation.current; setBusy("正在准备音色…");
    try {
      await engine.current!.prepareInstrument(instrument);
      if (id !== generation.current || !mounted.current || !dialog.current?.open) return;
      if (pickerMode === "add") changeProject(p => addTrack(p, instrument.id));
      else if (currentProject().activeTrackId) changeTrack(currentProject().activeTrackId!, { instrument: instrument.id, octave: 0, mode: "notes" });
      closeModal();
    } catch (error) { if (id === generation.current) { setBusy(""); setNotice(messageOf(error)); } }
  }
  async function preview(instrument: Instrument) {
    const id = ++generation.current; engine.current?.stopAll(); setBusy("正在准备音色…");
    try {
      await engine.current!.prepareInstrument(instrument);
      if (id !== generation.current || !mounted.current || !dialog.current?.open) return;
      setBusy(""); engine.current!.setVolume(currentProject().volume);
      const track = createTrack(instrument.id), p = currentProject(), now = engine.current!.now;
      [0, 2, 4].forEach((key, index) => engine.current!.playKey(track, p, key, now + index * .23, .32));
    } catch (error) { if (id === generation.current) { setBusy(""); setNotice(messageOf(error)); } }
  }
  async function audition(key: number) {
    const p = currentProject(), track = p.tracks.find(t => t.id === p.activeTrackId);
    if (!track) return;
    const id = generation.current;
    try {
      await engine.current!.prepareInstrument(getInstrument(track.instrument));
      if (id !== generation.current) return;
      engine.current!.setVolume(p.volume); engine.current!.playKey(track, p, key, engine.current!.now, .25);
    } catch (error) { setNotice(messageOf(error)); }
  }
  function editMix(update: (p: MusicProject) => MusicProject) {
    const playing = transport.current?.running;
    stop(); changeProject(update);
    if (playing) void start();
  }
  function editNotes(notes: MusicNote[]) {
    const p = currentProject(), track = p.tracks.find(t => t.id === p.activeTrackId);
    if (!track) return false;
    if (!canAddNotes(libraryRef.current, p, track, notes.length - track.notes.length)) { setNotice("这条音轨已经很满了，可以再加一种乐器。"); return false; }
    return changeTrack(track.id, { notes });
  }
  function enterEditor(trackId: string, tick = 0) {
    stop();
    if (currentProject().activeTrackId !== trackId) changeProject(p => ({ ...p, activeTrackId: trackId }), false);
    const p = currentProject();
    if (p.activeTrackId !== trackId) return;
    setEditing({ projectId: p.id, trackId, tick: stepTick(p, tick), noteId: null });
    moveCursor(tick);
  }
  function moveCursor(tick: number, noteId?: string) {
    const p = currentProject(), edit = manualRef.current, track = p.tracks.find(t => t.id === edit?.trackId);
    if (!edit || edit.projectId !== p.id || !track) return;
    const at = stepTick(p, tick);
    const selectedNote = track.notes.find(n => n.id === noteId) ?? track.notes.find(n => stepTick(p, n.tick) === at);
    setEditing({ ...edit, tick: at, noteId: selectedNote?.id ?? null });
  }
  function insertStep(key: number) {
    const p = currentProject(), edit = manualRef.current, track = p.tracks.find(t => t.id === edit?.trackId);
    if (!edit || !track || edit.projectId !== p.id || p.activeTrackId !== track.id) return;
    const placed = placeStepNote(p, track, edit.tick, key);
    if (placed.notes === track.notes || editNotes(placed.notes)) setEditing({ ...edit, tick: stepTick(p, placed.note.tick), noteId: placed.note.id });
  }
  function updateSelectedNote(patch: Partial<Pick<MusicNote, "tick" | "duration">>) {
    const p = currentProject(), edit = manualRef.current, track = p.tracks.find(t => t.id === edit?.trackId);
    const note = track?.notes.find(n => n.id === edit?.noteId);
    if (!edit || !track || !note) return;
    const next = updateStepNote(p, note, patch);
    if (editNotes(track.notes.map(n => n.id === note.id ? next : n))) moveCursor(next.tick, next.id);
  }
  function deleteSelectedNote() {
    const p = currentProject(), edit = manualRef.current, track = p.tracks.find(t => t.id === edit?.trackId);
    if (!edit?.noteId || !track) return;
    if (editNotes(track.notes.filter(n => n.id !== edit.noteId))) moveCursor(edit.tick);
  }
  function setBars(bars: MusicProject["bars"]) {
    const apply = () => { try { stop(); changeProject(p => resizeLoop(p, bars)); } catch (error) { setNotice(messageOf(error)); } };
    if (bars < project.bars && project.tracks.some(t => t.notes.length)) confirm("缩短循环会移除后面的音符，之后可以撤销。", apply);
    else apply();
  }
  function switchProject(id: string) {
    stop(); setEditing(null);
    if (!commitLibrary({ ...libraryRef.current, activeId: id })) return false;
    undoStack.current = []; setHistoryLength(0); closeModal(); return true;
  }
  function newWork(copy: boolean, source = currentProject()) {
    stop(); setEditing(null);
    if (libraryRef.current.projects.length >= MAX_PROJECTS) { setNotice("作品集已满，请先下载并移除一些作品。"); return; }
    const next = copy ? cloneProject(source) : createProject();
    if (commitLibrary({ ...libraryRef.current, activeId: next.id, projects: [...libraryRef.current.projects, next] })) {
      undoStack.current = []; setHistoryLength(0); closeModal();
    }
  }
  async function saveWork() {
    saver.current?.enqueue(libraryRef.current);
    try { await saver.current?.flush(); setNotice("作品已保存。"); }
    catch (error) { setNotice(messageOf(error)); }
  }
  function undo() {
    stop(); const previous = undoStack.current.pop();
    if (previous) changeProject(previous, false); setHistoryLength(undoStack.current.length);
  }
  const selectedInstrument = selected ? getInstrument(selected.instrument) : null;
  const blocked = !ready || Boolean(busy);
  const title: Record<Exclude<Modal, null>, string> = {
    instruments: pickerMode === "add" ? "加一种乐器" : "换个声音", rhythms: "选节奏", settings: "设置",
    works: "我的作品", export: "导出音乐", confirm: "请确认",
  };
  const modalFooter: ReactNode = (busy || saveError || notice) && <p className="metro-dialog-status" role="status">{busy || saveError || notice}</p>;
  return <div className={"metro" + (fullscreen.focused ? " metro--fullscreen" : "")} ref={root} data-skip-startup-greeting data-no-ui-translation>
    <GameTopBar title="节拍器" backHref="/?tab=art" backLabel="艺术" wallets={false} onBack={event => {
      event.preventDefault(); stop();
      void (saver.current?.flush() ?? Promise.resolve()).then(() => { window.location.href = "/?tab=art"; }, () => setNotice("请先下载作品，或重试保存。"));
    }} controls={<>
      <span className="metro-save" role="status">{!ready ? "读取中…" : saveStatus === "saving" ? "保存中…" : saveStatus === "error" ? "未保存" : "已保存"}</span>
      <button disabled={!ready || recording} onClick={() => openModal("works")}>作品</button>
      <button disabled={!historyLength || !ready || recording} onClick={undo}>撤销</button>
      <button disabled={fullscreen.switching} data-fullscreen-exit={fullscreen.focused || undefined} onClick={() => void (fullscreen.focused ? fullscreen.leave() : fullscreen.enter())}>{fullscreen.focused ? "退出全屏" : "全屏"}</button>
    </>} />
    <div className="metro-transport" aria-label="播放控制">
      <button className={"metro-play" + (running ? " is-playing" : "")} disabled={!ready || Boolean(busy)} onClick={() => running ? stop() : void start()}>
        <span aria-hidden="true">{running ? "■" : "▶"}</span>{running ? "停止" : "播放"}
      </button>
      <button className={"metro-record" + (frame.phase === "countin" ? " is-counting" : recording ? " is-recording" : "")} disabled={!ready || !selected || Boolean(busy)} onClick={() => recording ? stop() : void start(true)}>
        <span aria-hidden="true">{frame.phase === "countin" ? "■" : "●"}</span>{frame.phase === "countin" ? "取消准备" : recording ? "收好这一段" : "录一段"}
      </button>
      <span className="metro-control-divider" />
      <button className="metro-rhythm-button" disabled={blocked || recording} onClick={() => openModal("rhythms")}>{rhythm.name}<small>{rhythm.meter}</small><span aria-hidden="true">⌄</span></button>
      <label className="metro-tempo">速度
        <input aria-label="速度，每分钟拍数" type="number" min="40" max="200" value={project.bpm} disabled={blocked || recording}
          onChange={event => { const bpm = Number(event.target.value); if (Number.isInteger(bpm) && bpm >= 40 && bpm <= 200) { stop(); changeProject(p => ({ ...p, bpm })); } }} />
      </label>
      <label className="metro-loop">循环
        <select aria-label="循环长度" value={project.bars} disabled={blocked || recording} onChange={event => setBars(Number(event.target.value) as MusicProject["bars"])}>
          {[1, 2, 4, 8].map(bars => <option key={bars} value={bars}>{bars} 小节</option>)}
        </select>
      </label>
      <div className="metro-audio-toggles">
        <button aria-pressed={project.backing} disabled={!ready || recording} onClick={() => editMix(p => ({ ...p, backing: !p.backing }))}>伴奏{project.backing ? " ✓" : ""}</button>
        <button aria-pressed={project.click !== "off"} aria-label={"节拍声：" + CLICK_LABELS[project.click]}
          title={"切换为" + CLICK_LABELS[nextClickLevel(project.click)]} disabled={!ready || Boolean(busy)}
          onClick={() => changeProject(p => ({ ...p, click: nextClickLevel(p.click) }))}>节拍声 · {CLICK_LABELS[project.click]}</button>
        <button aria-label="创作设置" disabled={blocked || recording} onClick={() => openModal("settings")}>设置</button>
      </div>
    </div>
    <main className="metro-workspace">
      <div className="metro-track-heading">
        <button className="metro-add" disabled={blocked || recording || project.tracks.length >= MAX_TRACKS} onClick={() => choosePicker("add")}>＋ 加乐器</button>
        <div className="metro-measures" aria-hidden="true">{recording && Array.from({ length: COUNT_IN_BARS }, (_, i) => <span className="metro-prep-measure" key={"prep" + i}>预备 {i + 1}</span>)}{Array.from({ length: project.bars }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
        <div className="metro-beat-lights" aria-label={running ? (frame.phase === "countin" ? "预备" : "") + "第 " + (frame.bar + 1) + " 小节，第 " + (frame.beat + 1) + " 拍" : rhythm.meter}>
          {Array.from({ length: rhythm.pulses }, (_, i) => <span key={i} className={running && frame.beat === i ? "is-current" : ""}>{i + 1}</span>)}
        </div>
      </div>
      <div className="metro-tracks" aria-label="乐器音轨">
        {displayProject.tracks.map((track, index) => {
          const instrument = getInstrument(track.instrument), isSelected = selected?.id === track.id;
          return <div key={track.id} className="metro-track-group" style={{ "--track-color": ["var(--cyan-300)", "var(--violet-400)", "var(--pink-400)", "var(--warning-300)", "var(--green-400)"][index % 5] } as CSSProperties}>
            <div className={"metro-track" + (isSelected ? " is-selected" : "") + (track.muted ? " is-muted" : "")}>
            <button className="metro-track-name" aria-pressed={isSelected} disabled={recording || blocked} onClick={() => { stop(); setEditing(null); changeProject(p => ({ ...p, activeTrackId: track.id }), false); }}>
              <InstrumentIcon instrument={instrument.id} /><span>{instrument.name}<small>{isSelected ? "正在弹奏" : "选择"}</small></span>
            </button>
            <button className="metro-track-timeline" disabled={recording || blocked} aria-label={"点选编辑" + instrument.name + "音轨"} title="点选时间位置，按 1—0 添加音符" onClick={event => {
              const rect = event.currentTarget.getBoundingClientRect();
              const tick = event.detail === 0 ? 0 : (event.clientX - rect.left) / Math.max(1, rect.width) * projectTicks(project);
              enterEditor(track.id, tick);
            }}>
              <TrackStrip track={track} project={project} playhead={running ? recording ? frame.absoluteTick : frame.tick : null} reduced={reduced} leadInBars={recording ? COUNT_IN_BARS : 0} cursor={editing?.trackId === track.id ? stepTick(project, editing.tick) : undefined} />
            </button>
            <div className="metro-track-actions">
              <ToolButton icon="solo" label={"只听" + instrument.name} aria-pressed={track.solo} disabled={recording || blocked} onClick={() => editMix(p => ({ ...p, tracks: p.tracks.map(t => ({ ...t, solo: t.id === track.id ? !track.solo : false })) }))} />
              <ToolButton icon={track.muted ? "muted" : "volume"} label={(track.muted ? "取消静音" : "静音") + instrument.name} aria-pressed={track.muted} disabled={recording || blocked} onClick={() => editMix(p => ({ ...p, tracks: p.tracks.map(t => t.id === track.id ? { ...t, muted: !t.muted } : t) }))} />
              <ToolButton icon="edit" label={"手动编辑" + instrument.name} aria-pressed={editing?.trackId === track.id} disabled={recording || blocked} onClick={() => editing?.trackId === track.id ? (stop(), setEditing(null)) : enterEditor(track.id)} />
            </div>
            </div>
            {isSelected && <div className="metro-track-tools">
              <label>音量<input aria-label={instrument.name + "音量"} type="range" min="0" max="1" step=".05" value={track.volume} disabled={recording || blocked}
                onChange={e => changeTrack(track.id, { volume: Number(e.target.value) })} /><span>{Math.round(track.volume * 100)}</span></label>
              <ToolButton icon="swap" label="换个声音" disabled={recording || blocked} onClick={() => choosePicker("replace")} />
              <ToolButton icon="restart" label="重新录这一段" disabled={recording || blocked} onClick={() => void start(true, true)} />
              <ToolButton icon="clear" label="清空音符" disabled={recording || blocked || !track.notes.length} onClick={() => confirm("清空这条音轨？之后可以撤销。", () => changeTrack(track.id, { notes: [] }))} />
              <ToolButton icon="trash" label="移除音轨" disabled={recording || blocked} onClick={() => confirm("移除这条音轨？之后可以撤销。", () => {
                setEditing(null); changeProject(p => { const tracks = p.tracks.filter(t => t.id !== track.id); return { ...p, tracks, activeTrackId: tracks[0]?.id ?? null }; });
              })} />
            </div>}
            {editing?.trackId === track.id && <StepEditor project={project} track={track} cursor={stepTick(project, editing.tick)} selectedId={editing.noteId} disabled={blocked || running}
              onPosition={moveCursor} onUpdate={updateSelectedNote} onDelete={deleteSelectedNote} onAudition={key => void audition(key)}
              onClose={() => { stop(); setEditing(null); }} onDivision={division => {
                const snap = ({ 1: "beat", 2: "half", 3: "third", 4: "quarter" } as const)[division as 1 | 2 | 3 | 4];
                if (changeProject(p => ({ ...p, snap }))) moveCursor(editing.tick);
              }} />}
          </div>;
        })}
        {project.tracks.length === 0 && <button className="metro-empty-add" onClick={() => choosePicker("add")} disabled={blocked}>＋ 选一种乐器</button>}
      </div>
    </main>
    <section className="metro-keyboard" aria-label="演奏键盘">
      <div className="metro-keyboard-tools">
        {selected && selectedInstrument ? <>
          <button className="metro-selected-sound" disabled={blocked || recording} onClick={() => choosePicker("replace")}><InstrumentIcon instrument={selectedInstrument.id} />{selectedInstrument.name}<span aria-hidden="true">⌄</span></button>
          {!selectedInstrument.drums && <div className="metro-octave"><button aria-label="降低一个音区" disabled={blocked || recording || selected.octave <= -1} onClick={() => { stop(); changeTrack(selected.id, { octave: (selected.octave - 1) as MusicTrack["octave"] }); }}>−</button><span>{selected.octave === -1 ? "低音" : selected.octave === 1 ? "高音" : "中音"}</span><button aria-label="升高一个音区" disabled={blocked || recording || selected.octave >= 1} onClick={() => { stop(); changeTrack(selected.id, { octave: (selected.octave + 1) as MusicTrack["octave"] }); }}>＋</button></div>}
          {canChord(selected) && <button disabled={blocked || recording} aria-pressed={selected.mode === "chords"} onClick={() => { stop(); changeTrack(selected.id, { mode: selected.mode === "chords" ? "notes" : "chords" }); }}>一键和弦{selected.mode === "chords" ? " ✓" : ""}</button>}
          <span className={"metro-record-position" + (frame.phase === "countin" ? " is-counting" : "")} role="status">{frame.phase === "countin" ? "预备 " + (frame.bar + 1) + "/" + COUNT_IN_BARS + " · 第 " + (frame.beat + 1) + " 拍" : frame.phase === "recording" ? "录制中 · " + (frame.bar + 1) + " / " + project.bars : busy || ""}</span>
          <button className="metro-edit-notes" aria-pressed={Boolean(editing)} disabled={blocked || recording} onClick={() => editing ? (stop(), setEditing(null)) : enterEditor(selected.id)}>{editing ? "完成编辑" : "手动编辑"}</button>
        </> : <span>选一种乐器开始</span>}
      </div>
      <div className={"metro-keys" + (selectedInstrument?.drums ? " metro-keys--drums" : "")}>
        {KEYS.map((key, index) => <button key={key} type="button" className={pressed.has(index) ? "is-held" : ""} disabled={!ready || !selected}
          aria-label={selected ? "按键 " + key + "，" + keyLabel(selected, project, index) : "按键 " + key}
          onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); void press("pointer-" + event.pointerId, index); }}
          onPointerUp={event => release("pointer-" + event.pointerId)} onPointerCancel={event => release("pointer-" + event.pointerId)} onLostPointerCapture={event => release("pointer-" + event.pointerId)}
          onClick={event => { if (event.detail === 0) { const token = "accessible-" + index; void press(token, index); setTimeout(() => release(token), 220); } }}>
          <kbd>{key}</kbd><span>{selected ? keyLabel(selected, project, index) : "—"}</span>
        </button>)}
      </div>
    </section>
    {(notice || saveError) && !modal && <div className="metro-notice" role="status"><span>{saveError || notice}</span>{saveError && <><button onClick={() => void saver.current?.flush().catch(() => undefined)}>重试保存</button><button onClick={() => download(new Blob([JSON.stringify(libraryRef.current, null, 2)], { type: "application/json" }), safeName(project.title) + ".json")}>下载作品</button></>}<button onClick={() => setNotice("")} aria-label="收起提示" disabled={Boolean(saveError)}>×</button></div>}
    {!ready && <div className="metro-loading" role="status"><p>{loadError || "正在打开作品…"}</p>{loadError && <button onClick={() => void load()}>重试</button>}</div>}
    <dialog ref={dialog} className={"metro-dialog metro-dialog--" + (modal ?? "closed")} aria-labelledby="metro-dialog-title"
      onCancel={event => { event.preventDefault(); closeModal(); }}
      onClose={() => { const target = opener.current; if (target?.isConnected) target.focus({ preventScroll: true }); }}
      onKeyDown={event => { if (event.key === "Tab" || event.key === "Escape") event.stopPropagation(); }}
      onClick={event => { if (event.target === dialog.current) closeModal(); }}>
      <header className="metro-dialog-header"><h2 id="metro-dialog-title">{modal ? title[modal] : ""}</h2><button onClick={closeModal}>关闭</button></header>
      {modal === "instruments" && <>
        <div className="metro-family-tabs" aria-label="乐器家族">{["常用", ...new Set(INSTRUMENTS.map(i => i.family))].map(f => <button key={f} aria-pressed={family === f} onClick={() => setFamily(f)}>{f}</button>)}</div>
        <div className="metro-instrument-list">{INSTRUMENTS.filter(i => family === "常用" ? FAVORITES.includes(i.id) : i.family === family).map(instrument => <div className="metro-instrument-card" key={instrument.id}>
          <button className="metro-instrument-choice" disabled={Boolean(busy)} onClick={() => void chooseInstrument(instrument)}><InstrumentIcon instrument={instrument.id} /><span>{instrument.name}</span></button>
          <button className="metro-preview" disabled={Boolean(busy)} aria-label={"试听" + instrument.name} onClick={() => void preview(instrument)}>试听</button>
        </div>)}</div>
      </>}
      {modal === "rhythms" && <div className="metro-rhythm-list">{RHYTHMS.map(r => <div key={r.id} className={"metro-rhythm-card" + (project.preset === r.id ? " is-selected" : "")}>
        <button disabled={Boolean(busy)} aria-pressed={project.preset === r.id} onClick={() => { changeProject(p => changePreset(p, r.id)); closeModal(); }}><strong>{r.name}</strong><span>{r.meter}</span><div className="metro-rhythm-dots" aria-hidden="true">{Array.from({ length: r.pulses * r.division }, (_, i) => <i key={i} className={i % r.division === 0 ? "is-beat" : ""} />)}</div></button>
        <button disabled={Boolean(busy)} onClick={() => {
          const p = { ...changePreset(currentProject(), r.id), tracks: [], backing: true, click: "off" as const, bars: 1 as const };
          const id = ++generation.current; engine.current?.stopAll(); setBusy("正在准备音色…");
          void engine.current!.prepare(p).then(() => {
            if (id !== generation.current || !dialog.current?.open) return;
            setBusy(""); engine.current!.setVolume(p.volume);
            const startTime = engine.current!.now;
            for (const [tick, pitch, velocity] of r.hits) engine.current!.schedule({ kind: "drum", tick, pitch, velocity }, startTime + tick * 60 / r.bpm / TICKS, 60 / r.bpm / TICKS, p);
          }).catch(error => { if (id === generation.current) { setBusy(""); setNotice(messageOf(error)); } });
        }}>试听</button>
      </div>)}</div>}
      {modal === "settings" && <div className="metro-settings">
        <label>音量<input type="range" min="0" max="1" step=".05" value={project.volume} onChange={e => { const volume = Number(e.target.value); changeProject(p => ({ ...p, volume })); engine.current?.setVolume(volume); }} /></label>
        <label>对齐节拍<select value={project.snap} onChange={e => changeProject(p => ({ ...p, snap: e.target.value as MusicProject["snap"] }))}><option value="auto">自动</option><option value="beat">整拍</option><option value="half">半拍</option><option value="third">每拍三等分</option><option value="quarter">每拍四等分</option><option value="off">自由敲</option></select></label>
        <label>可弹的音<select value={project.scale} onChange={e => changeProject(p => ({ ...p, scale: e.target.value as MusicProject["scale"] }))}><option value="major">七个音 · do re mi fa sol la si</option><option value="pentatonic">五个音 · do re mi sol la</option></select></label>
        <a href="/audio/metronome/CREDITS.md" target="_blank" rel="noreferrer">音色来源</a>
      </div>}
      {modal === "works" && <div className="metro-works">
        <label className="metro-title-input">作品名<input key={project.id} maxLength={48} defaultValue={project.title} onBlur={e => {
          const title = e.target.value.trim();
          if (title && title !== project.title) changeProject(p => ({ ...p, title }));
          else e.target.value = project.title;
        }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>
        <div className="metro-work-buttons"><button disabled={saveStatus === "saving"} onClick={() => void saveWork()}>保存</button><button disabled={library.projects.length >= MAX_PROJECTS} onClick={() => newWork(false)}>＋ 新作品</button><button onClick={() => { setModal("export"); setExportRepeats(2); }}>导出音乐</button><button disabled={Boolean(busy)} onClick={() => importInput.current?.click()}>导入作品</button></div>
        <input ref={importInput} type="file" accept=".json,application/json" hidden aria-label="导入可编辑作品" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
          const id = ++generation.current; setBusy("正在读取作品…");
          void (async () => {
            if (file.size > 4 * 1024 * 1024) throw new Error("作品文件太大了。");
            const imported = parseMusicLibrary(JSON.parse(await file.text()));
            if (!imported) throw new Error("这不是可使用的节拍器作品，原作品已保留。");
            if (id !== generation.current) return;
            if (libraryRef.current.projects.length + imported.projects.length > MAX_PROJECTS) throw new Error("作品集空间不够，请先下载并移除一些作品。");
            const additions = imported.projects.map(p => ({ ...cloneProject(p), title: (p.title + " · 导入").slice(0, 48) }));
            const activeId = additions[imported.projects.findIndex(p => p.id === imported.activeId)].id;
            if (commitLibrary({ ...libraryRef.current, activeId, projects: [...libraryRef.current.projects, ...additions] })) {
              undoStack.current = []; setHistoryLength(0); closeModal();
            }
          })().catch(error => { if (id === generation.current) setNotice(messageOf(error)); }).finally(() => { if (id === generation.current) setBusy(""); });
        }} />
        <div className="metro-work-list">{library.projects.map(work => <div key={work.id}><button aria-label={"打开作品" + work.title} aria-pressed={project.id === work.id} onClick={() => switchProject(work.id)}><span>{project.id === work.id ? "✓ " : ""}{work.title}</span><small>{work.tracks.length} 种乐器 · {getRhythm(work.preset).name}</small></button><div className="metro-work-actions">
          <button aria-label={"播放作品" + work.title} onClick={() => { if (switchProject(work.id)) void start(); }}>播放</button>
          <button aria-label={"复制作品" + work.title} disabled={library.projects.length >= MAX_PROJECTS} onClick={() => newWork(true, work)}>复制</button>
          <button aria-label={"删除作品" + work.title} onClick={() => confirm("删除「" + work.title + "」？请先导出需要保留的作品。", () => {
          commitLibrary(deleteProject(libraryRef.current, work.id));
          undoStack.current = []; setHistoryLength(0);
        })}>删除</button></div></div>)}</div>
      </div>}
      {modal === "export" && <div className="metro-settings">
        <label>重复<select value={exportRepeats} disabled={Boolean(busy)} onChange={e => setExportRepeats(Number(e.target.value))}>{[1, 2, 4, 8].map(n => <option key={n} value={n}>{n} 遍</option>)}</select></label>
        <button className="metro-play" disabled={Boolean(busy)} onClick={() => {
          const id = ++generation.current; setBusy("正在导出…");
          void engine.current!.exportWav(currentProject(), exportRepeats).then(blob => {
            if (id !== generation.current || !mounted.current) return;
            download(blob, safeName(project.title) + ".wav"); setBusy(""); setNotice("音乐已导出。");
          }).catch(error => { if (id === generation.current) { setBusy(""); setNotice(messageOf(error)); } });
        }}>下载音乐</button>
        <button onClick={() => download(new Blob([JSON.stringify(libraryRef.current, null, 2)], { type: "application/json" }), safeName(project.title) + ".json")}>下载可编辑作品</button>
      </div>}
      {modal === "confirm" && <div className="metro-confirm"><p>{confirmText}</p><div><button onClick={closeModal}>取消</button><button onClick={() => { const action = confirmAction.current; closeModal(); action?.(); }}>确认</button></div></div>}
      {modalFooter}
    </dialog>
  </div>;
}
