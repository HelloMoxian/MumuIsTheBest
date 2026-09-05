import { mkdir, readFile, copyFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Reuse checked-in CC0 originals. Requires ffmpeg only to rebuild the derived WAVs.
const original = new URL("../assets/audio/galaxy-racer/", import.meta.url);
const output = new URL("../apps/web/public/audio/tetris/", import.meta.url);
const items = [
  { name: "move", input: "lane-whoosh-alt.cc0.ogg", duration: .1, author: "Kenney", source: "https://kenney.nl/assets/digital-audio", originalName: "phaseJump2", hash: "5d85717cfca231f7da7887cef5f44b2131bbe3308eb0c1fee0b4f9e61d59b571" },
  { name: "rotate", input: "lane-whoosh-alt.cc0.ogg", duration: .28, author: "Kenney", source: "https://kenney.nl/assets/digital-audio", originalName: "phaseJump2", hash: "5d85717cfca231f7da7887cef5f44b2131bbe3308eb0c1fee0b4f9e61d59b571" },
  { name: "lock", input: "collision-soft.cc0.ogg", duration: .28, author: "qubodup", source: "https://opengameart.org/content/crash-collision", originalName: "qubodup-crash.ogg", hash: "e468ee00a6c94313cf4efcf347b5f4e51e98e629608be277a8f58feb5e2267ff" },
  { name: "clear", input: "checkpoint.cc0.ogg", duration: .827, author: "Kenney", source: "https://kenney.nl/assets/digital-audio", originalName: "threeTone1", hash: "bdf21eb12e65507f091d074886fdac820e1ccae51d060caa168e5567acadb84b" },
  { name: "level", input: "reward.cc0.ogg", duration: 1.149, author: "Kenney", source: "https://kenney.nl/assets/digital-audio", originalName: "powerUp3", hash: "59e7591f7a068882767bc1fd61edabf479b78787466d3a70bc49dfa0533777d2" },
  { name: "music", input: "theme-solar-loop.cc0.mp3", author: "wipics", source: "https://opengameart.org/content/city-loop-0", originalName: "city-loop.mp3", hash: "9349982fb8e365167bc5c89f2ac50d3b5376b9f627d506ba30a9b26c8230597e" },
];
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
for (const item of items) {
  if (digest(await readFile(new URL(item.input, original))) !== item.hash) throw new Error(`Source checksum mismatch: ${item.input}`);
}
await mkdir(output, { recursive: true });
const manifest = [];
for (const item of items) {
  const sourceFile = new URL(item.input, original);
  const filename = `${item.name}.cc0.${item.name === "music" ? "mp3" : "wav"}`;
  const target = new URL(filename, output);
  if (item.name === "music") await copyFile(sourceFile, target);
  else execFileSync("ffmpeg", ["-v", "error", "-y", "-i", fileURLToPath(sourceFile), "-t", String(item.duration), "-af", `volume=0.75,afade=t=in:d=0.006,afade=t=out:st=${item.duration - .03}:d=0.03`, "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", "-fflags", "+bitexact", "-flags:a", "+bitexact", fileURLToPath(target)]);
  manifest.push({ file: filename, author: item.author, license: "CC0-1.0", source: item.source, originalName: item.originalName, sourceFile: `assets/audio/galaxy-racer/${item.input}`, sourceSha256: item.hash, sha256: digest(await readFile(target)), processing: item.name === "music" ? "Unmodified copy" : `First ${item.duration}s, 0.75 gain, 6ms fade-in, 30ms fade-out, mono 22050Hz PCM16` });
}
await writeFile(new URL("manifest.json", output), JSON.stringify({ assets: manifest }, null, 2) + "\n");
console.log("Prepared six local CC0 audio assets for Tetris.");
