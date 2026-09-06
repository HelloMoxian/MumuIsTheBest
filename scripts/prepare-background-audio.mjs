import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const effects = [
  ["select", "click_001", .10], ["swap", "maximize_006", .32], ["return", "back_001", .064],
  ["clear", "glass_001", .279], ["cascade", "confirmation_001", .290],
  ["flame", "glass_004", .693], ["star", "confirmation_004", .491],
  ["cube", "maximize_001", .259], ["land", "pluck_001", .103],
];
const assets = [];
for (const [name, source, duration] of effects) {
  const input = "assets/audio/bejeweled/" + source + ".ogg";
  const output = "apps/web/public/audio/bejeweled/" + name + ".wav";
  await mkdir(new URL("apps/web/public/audio/bejeweled/", root), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", fileURLToPath(new URL(input, root)),
    "-t", String(duration), "-af", "loudnorm=I=-22:TP=-3:LRA=7,afade=t=in:d=0.004,afade=t=out:st=" + Math.max(.008, duration - .025) + ":d=0.025",
    "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", "-fflags", "+bitexact", "-flags:a", "+bitexact",
    fileURLToPath(new URL(output, root))]);
  assets.push({ file: output, sourceFile: input, author: "Kenney", license: "CC0-1.0",
    source: "https://kenney.nl/assets/interface-sounds", original: source + ".ogg",
    sourceSha256: hash(await readFile(new URL(input, root))), sha256: hash(await readFile(new URL(output, root))),
    processing: "Trim, -22 LUFS / -3 dBTP loudness target, 4ms attack/25ms release, 22050Hz mono PCM16" });
}
for (const [name, author, page] of [
  ["puzzling", "Ruskerdax", "https://opengameart.org/content/puzzling"],
  ["scifi", "MintoDog", "https://opengameart.org/content/sci-fi-puzzle-in-game-3"],
]) {
  const input = "assets/audio/global/" + name + ".mp3";
  const output = "apps/web/public/audio/global/" + name + ".mp3";
  await mkdir(new URL("apps/web/public/audio/global/", root), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", fileURLToPath(new URL(input, root)),
    "-map_metadata", "-1", "-af", "loudnorm=I=-20:TP=-3:LRA=9", "-ar", "44100", "-ac", "2",
    "-c:a", "libmp3lame", "-b:a", "128k", fileURLToPath(new URL(output, root))]);
  assets.push({ file: output, sourceFile: input, author, source: page, license: "CC0-1.0",
    sourceSha256: hash(await readFile(new URL(input, root))), sha256: hash(await readFile(new URL(output, root))),
    processing: "-20 LUFS / -3 dBTP loudness target, 44100Hz stereo MP3 128kbps, original duration retained" });
}
await writeFile(new URL("assets/audio/global/manifest.json", root), JSON.stringify({ assets }, null, 2) + "\n");
console.log("Prepared 2 music tracks and 9 crystal sound effects.");
