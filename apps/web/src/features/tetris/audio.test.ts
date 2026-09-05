import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { TetrisAudio, type AudioClip } from "./audio";

class FakeClip implements AudioClip {
  loop = false; volume = 1; currentTime = 0; preload = "";
  onerror: (() => void) | null = null;
  onended: (() => void) | null = null;
  plays = 0; pauses = 0;
  async play() { this.plays++; }
  pause() { this.pauses++; }
}
function setup() {
  const clips = new Map<string, FakeClip[]>();
  const audio = new TetrisAudio(source => {
    const clip = new FakeClip();
    const group = clips.get(source) ?? [];
    group.push(clip); clips.set(source, group); return clip;
  });
  const get = (name: string) => clips.get(`/audio/tetris/${name}.cc0.${name === "music" ? "mp3" : "wav"}`)!;
  return { audio, get };
}

test("声音默认关闭；赛前打开也不自动播放；开始后播放循环音乐", () => {
  const { audio, get } = setup();
  audio.play("rotate", 0);
  audio.setPlaying(true);
  assert.equal(get("music")[0].plays, 0);
  audio.setPlaying(false);
  audio.configure({ music: true, effects: true });
  assert.equal(get("music")[0].plays, 0);
  audio.setPlaying(true);
  assert.equal(get("music")[0].plays, 1);
  assert.equal(get("music")[0].loop, true);
  audio.play("rotate", 0);
  assert.equal(get("rotate")[0].plays, 1);
});

test("长按限流和有限复音；朗读时音乐与音效降音量", () => {
  const { audio, get } = setup();
  audio.configure({ music: true, effects: true }); audio.setPlaying(true);
  for (let i = 0; i < 60; i++) audio.play("move", i);
  assert.equal(get("move").reduce((sum, clip) => sum + clip.plays, 0), 1);
  audio.play("move", 70);
  assert.equal(get("move")[1].plays, 1);
  const musicVolume = get("music")[0].volume;
  const effectVolume = get("move")[0].volume;
  audio.setDucked(true);
  assert.ok(get("music")[0].volume < musicVolume);
  assert.ok(get("move")[0].volume < effectVolume);
  audio.setDucked(false);
  assert.equal(get("music")[0].volume, musicVolume);
});

test("暂停、静音与离页停止音频，继续不重叠开音乐", () => {
  const { audio, get } = setup();
  audio.configure({ music: true, effects: true }); audio.setPlaying(true);
  audio.configure({ music: true, effects: false });
  assert.equal(get("music")[0].plays, 1);
  audio.setPlaying(false);
  assert.ok(get("music")[0].pauses > 0);
  audio.play("clear", 100);
  assert.equal(get("clear")[0].plays, 0);
  audio.setPlaying(true);
  assert.equal(get("music")[0].plays, 2);
  audio.dispose(); audio.setPlaying(true);
  assert.equal(get("music")[0].plays, 2);
});

test("异步播放失败被捕获；关闭后迟到的成功不重新发声", async () => {
  let errors = 0;
  const failing = new FakeClip();
  failing.play = () => Promise.reject(new Error("Unavailable"));
  const audio = new TetrisAudio(() => failing, () => { errors++; });
  audio.configure({ music: true, effects: true }); audio.setPlaying(true); audio.play("lock");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors, 2);
  audio.dispose();
  let resolvePlay: (() => void) | undefined;
  const late = new FakeClip();
  late.play = () => new Promise(resolve => { resolvePlay = resolve; });
  const delayed = new TetrisAudio(() => late);
  delayed.configure({ music: true, effects: false }); delayed.setPlaying(true);
  delayed.setPlaying(false);
  const count = late.pauses;
  resolvePlay!();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(late.pauses > count);
});

test("六个CC0音频摘要匹配、编码有效，音效具有实际样本与受限峰值", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../../public/audio/tetris/manifest.json", import.meta.url), "utf8")) as { assets: { file: string; sha256: string; license: string }[] };
  assert.equal(manifest.assets.length, 6);
  for (const name of ["move", "rotate", "lock", "clear", "level", "music"]) {
    const filename = `${name}.cc0.${name === "music" ? "mp3" : "wav"}`;
    const asset = manifest.assets.find(item => item.file === filename)!;
    const bytes = readFileSync(new URL(`../../../public/audio/tetris/${filename}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    assert.equal(asset.license, "CC0-1.0");
    if (name === "music") {
      assert.ok(bytes.toString("ascii", 0, 3) === "ID3" || bytes[0] === 0xff);
      assert.ok(bytes.length > 10000);
      continue;
    }
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
    assert.equal(bytes.readUInt32LE(24), 22050);
    assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
    let peak = 0;
    for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
    assert.ok(peak > 1000 && peak < 28000);
  }
});
