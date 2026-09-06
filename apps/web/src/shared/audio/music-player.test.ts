import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DEFAULT_AUDIO_PREFERENCES as defaults, parseAudioPreferences } from "../../../../server/src/audio-preferences";
import { MUSIC_TRACKS, MusicPlayer, type MusicClip, type MusicStatus } from "./music-player";
import { audioFocus } from "./audio-focus";
class Clip implements MusicClip {
  loop = false; volume = 1; preload = ""; plays = 0; pauses = 0;
  onerror: HTMLAudioElement["onerror"] = null;
  play: () => Promise<void> = async () => { this.plays++; };
  pause() { this.pauses++; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test("恢复自动播放、切曲停旧曲、音量和关闭偏好生效", async () => {
  const clips: Clip[] = [], statuses: MusicStatus[] = [];
  const player = new MusicPlayer(() => { const c = new Clip(); clips.push(c); return c; }, s => statuses.push(s));
  player.configure({ ...defaults }); await tick();
  assert.equal(clips[0].plays, 1); assert.equal(clips[0].loop, true);
  player.configure({ ...defaults, musicVolume: .35 }); await tick();
  assert.equal(clips[0].plays, 1); assert.equal(clips[0].volume, .35);
  player.configure({ ...defaults, track: "scifi" }); await tick();
  assert.ok(clips[0].pauses); assert.equal(clips[1].plays, 1);
  player.configure({ ...defaults, track: "scifi", musicEnabled: false });
  player.retry(); assert.equal(clips[1].plays, 1); assert.equal(statuses.at(-1), "off");
  player.dispose();
});
test("自动播放被拦截后只在操作时重试，隐藏和麦克风暂停，朗读降音量", async () => {
  const clip = new Clip(); let attempts = 0; const statuses: MusicStatus[] = [];
  clip.play = async () => { if (++attempts === 1) throw Object.assign(new Error(), { name: "NotAllowedError" }); };
  const player = new MusicPlayer(() => clip, s => statuses.push(s));
  player.configure({ ...defaults }); await tick(); assert.equal(statuses.at(-1), "blocked");
  player.setEnvironment(false, false, true); assert.equal(attempts, 1);
  player.retry(); await tick(); assert.equal(statuses.at(-1), "playing");
  assert.equal(clip.volume, defaults.musicVolume * .18);
  player.setEnvironment(true, false, false); assert.equal(statuses.at(-1), "paused");
  player.retry(); assert.equal(attempts, 2);
  player.setEnvironment(false, true, false); assert.equal(attempts, 2);
  player.setEnvironment(false, false, false); await tick();
  assert.equal(attempts, 3); assert.equal(clip.volume, defaults.musicVolume); player.dispose();
});
test("切曲、暂停和销毁后迟到的播放回执不能复活旧音乐", async () => {
  let resolveOld!: () => void;
  const old = new Clip(), current = new Clip(); let count = 0;
  old.play = () => new Promise(resolve => { resolveOld = resolve; });
  const player = new MusicPlayer(() => ++count === 1 ? old : current, () => {});
  player.configure({ ...defaults });
  player.setEnvironment(true, false, false);
  player.setEnvironment(false, false, false); await tick();
  const pauses = current.pauses;
  resolveOld(); await tick();
  assert.equal(current.pauses, pauses); assert.ok(old.pauses >= 2);
  player.dispose(); player.retry(); assert.equal(current.plays, 1);
});
test("资源失败可换曲恢复，重复环境通知不会叠加播放", async () => {
  const clips: Clip[] = [], states: MusicStatus[] = [];
  const player = new MusicPlayer(() => { const c = new Clip(); clips.push(c); return c; }, s => states.push(s));
  player.configure({ ...defaults }); await tick();
  clips[0].onerror?.call({} as HTMLAudioElement, new Event("error"));
  assert.equal(states.at(-1), "error");
  player.configure({ ...defaults, track: "solar" }); await tick();
  for (let i = 0; i < 20; i++) player.setEnvironment(false, false, false);
  assert.equal(clips[1].plays, 1); assert.equal(states.at(-1), "playing");
  player.dispose();
});
test("麦克风引用独立释放，重复释放安全，全站音乐可通知旧游戏让出配乐", () => {
  let changes = 0; const unsubscribe = audioFocus.subscribe(() => changes++);
  const a = audioFocus.acquireMicrophone(), b = audioFocus.acquireMicrophone();
  a(); a(); assert.equal(audioFocus.isMicrophoneActive(), true);
  b(); assert.equal(audioFocus.isMicrophoneActive(), false);
  audioFocus.setMusicActive(true); assert.equal(audioFocus.isMusicActive(), true);
  audioFocus.setMusicActive(false); unsubscribe(); assert.equal(changes, 6);
});
test("音频目录、摘要、实际编码和音量范围有效；未来设置与陌生曲目被拒绝", () => {
  assert.ok(parseAudioPreferences(defaults));
  for (const value of [{ ...defaults, schemaVersion: 2 }, { ...defaults, track: "../secret" },
    { ...defaults, musicVolume: NaN }, { ...defaults, effectsVolume: 2 }, { ...defaults, extra: 1 }, {}]) {
    assert.equal(parseAudioPreferences(value), undefined);
  }
  for (const track of MUSIC_TRACKS) assert.ok(readFileSync(new URL("../../../public" + track.src, import.meta.url)).length > 10000);
  const manifest = JSON.parse(readFileSync(new URL("../../../../../assets/audio/global/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.assets.length, 11);
  for (const asset of manifest.assets) {
    const bytes = readFileSync(new URL("../../../../../" + asset.file, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    assert.equal(asset.license, "CC0-1.0");
    if (!asset.file.endsWith(".wav")) continue;
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF"); assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
    let offset = 12, peak = 0;
    while (offset < bytes.length - 8) {
      const size = bytes.readUInt32LE(offset + 4);
      if (bytes.toString("ascii", offset, offset + 4) === "data")
        for (let i = offset + 8; i < offset + 8 + size; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
      offset += 8 + size + size % 2;
    }
    assert.ok(peak > 300 && peak < 31000, asset.file + " peak " + peak);
  }
});
