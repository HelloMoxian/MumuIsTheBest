import { useEffect, useRef, useState, type ReactNode } from "react";
import { browserTts } from "../speech";
import { getExperienceSnapshot, subscribeExperience } from "../experience/experience-store";
import { audioFocus } from "./audio-focus";
import { getAudioSnapshot, hydrateAudioPreferences, setAudioPreferences, subscribeAudio, useAudioPreferences } from "./audio-store";
import { MUSIC_TRACKS, MusicPlayer, type MusicStatus } from "./music-player";
import "./global-music.css";

const STATUS: Record<MusicStatus, string> = {
  off: "音乐已关闭", paused: "音乐已暂停", loading: "音乐准备中…",
  playing: "正在播放", blocked: "点击后播放", error: "音乐暂时不可用，可重试或换一首",
};
export function GlobalMusicLayer({ children }: { children: ReactNode }) {
  const settings = useAudioPreferences();
  const [status, setStatus] = useState<MusicStatus>("off");
  const player = useRef<MusicPlayer | null>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const music = new MusicPlayer(src => new Audio(src), next => {
      setStatus(next);
      audioFocus.setMusicActive(next === "playing" || next === "loading");
    });
    player.current = music;
    const configure = () => { const state = getAudioSnapshot(); if (state.ready) music.configure(state.preferences); };
    const environment = () => {
      const tts = browserTts.getSnapshot().status;
      const speech = getExperienceSnapshot().speechStatus;
      music.setEnvironment(document.hidden, audioFocus.isMicrophoneActive(),
        tts === "speaking" || tts === "loading" || speech.startsWith("speaking"));
    };
    const gesture = (event: Event) => { if (event.isTrusted) music.retry(); };
    const hide = () => music.setEnvironment(true, false, false);
    const cleanups = [subscribeAudio(configure), audioFocus.subscribe(environment),
      browserTts.subscribe(environment), subscribeExperience(environment)];
    document.addEventListener("visibilitychange", environment);
    document.addEventListener("pointerdown", gesture, true);
    document.addEventListener("keydown", gesture, true);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", environment);
    environment();
    void hydrateAudioPreferences().then(configure);
    return () => {
      cleanups.forEach(fn => fn()); music.dispose(); player.current = null; audioFocus.setMusicActive(false);
      document.removeEventListener("visibilitychange", environment);
      document.removeEventListener("pointerdown", gesture, true);
      document.removeEventListener("keydown", gesture, true);
      window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", environment);
    };
  }, []);
  const change = (patch: Parameters<typeof setAudioPreferences>[0]) => {
    setAudioPreferences(patch); player.current?.retry();
  };
  return <>{children}
    <button ref={launcher} className="global-music-launcher" type="button" data-skip-startup-greeting
      onClick={() => panel.current?.showModal()} aria-haspopup="dialog" aria-label={"背景音乐：" + STATUS[status]}>
      <span aria-hidden="true">♫</span> 背景音乐
    </button>
    <dialog className="global-music-panel" ref={panel} aria-labelledby="global-music-title" data-skip-startup-greeting
      onClose={() => launcher.current?.focus()} onClick={event => { if (event.target === panel.current) panel.current.close(); }}>
      <div className="global-music-content">
        <header><h2 id="global-music-title">星际音乐盒</h2><button type="button" onClick={() => panel.current?.close()}>关闭</button></header>
        <p role="status">{!settings.ready ? settings.error || "正在恢复音乐设置…" : STATUS[status]}</p>
        <button className="global-music-toggle" type="button" disabled={!settings.ready} aria-pressed={settings.preferences.musicEnabled}
          onClick={() => change({ musicEnabled: !settings.preferences.musicEnabled })}>
          背景音乐：{settings.preferences.musicEnabled ? "开" : "关"}
        </button>
        <fieldset disabled={!settings.ready}><legend>选择一首音乐</legend>
          {MUSIC_TRACKS.map(track => <button type="button" key={track.id} className="global-music-track"
            aria-pressed={settings.preferences.track === track.id}
            onClick={() => change({ track: track.id, musicEnabled: true })}>
            <span>{settings.preferences.track === track.id ? "✓ " : "♫ "}{track.title}</span><small>{track.detail}</small>
          </button>)}
        </fieldset>
        <label>音乐音量 <output>{Math.round(settings.preferences.musicVolume * 100)}%</output>
          <input type="range" min="0" max="100" step="1" disabled={!settings.ready} value={Math.round(settings.preferences.musicVolume * 100)}
            onChange={event => change({ musicVolume: Number(event.target.value) / 100 })} />
        </label>
        <div className="global-music-effects">
          <button type="button" disabled={!settings.ready} aria-pressed={settings.preferences.effectsEnabled}
            onClick={() => change({ effectsEnabled: !settings.preferences.effectsEnabled })}>
            宝石音效：{settings.preferences.effectsEnabled ? "开" : "关"}
          </button>
          <label>音效音量 <output>{Math.round(settings.preferences.effectsVolume * 100)}%</output>
            <input type="range" min="0" max="100" step="1" disabled={!settings.ready} value={Math.round(settings.preferences.effectsVolume * 100)}
              onChange={event => change({ effectsVolume: Number(event.target.value) / 100 })} />
          </label>
        </div>
        {status === "blocked" || status === "error" ? <button type="button" onClick={() => player.current?.retry()}>播放这首音乐</button> : null}
        <p className="global-music-note" role="status">{settings.saving ? "正在保存…" : settings.ready && !settings.error ? "选择会自动保存，各个页面都能使用。" : settings.error}</p>
        {settings.error && <button type="button" onClick={() => settings.ready ? setAudioPreferences({}) : void hydrateAudioPreferences()}>重试保存或恢复</button>}
      </div>
    </dialog>
  </>;
}
