import { readFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("content/bejeweled/praise.v1.json", root), "utf8"));
const output = new URL("apps/web/public/audio/bejeweled/praise/", root);
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), "mumu-bejeweled-praise-"));
const assets = [];
try {
  for (const phrase of catalog.phrases) {
    if (!/^[a-z-]+$/.test(phrase.id) || !phrase.en || !phrase.zh) throw new Error("Invalid phrase");
    const en = join(scratch, phrase.id + "-en.aiff"), zh = join(scratch, phrase.id + "-zh.aiff");
    execFileSync("say", ["-v", catalog.voices.en, "-r", String(catalog.speechRate), "-o", en, phrase.en]);
    execFileSync("say", ["-v", catalog.voices.zh, "-r", String(catalog.speechRate), "-o", zh, phrase.zh]);
    const file = new URL(phrase.id + ".mp3", output);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", en, "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono:d=" + catalog.pauseMs / 1000, "-i", zh,
      "-filter_complex", "[0:a]aresample=22050,aformat=sample_fmts=fltp:channel_layouts=mono[en];[2:a]aresample=22050,aformat=sample_fmts=fltp:channel_layouts=mono[zh];[en][1:a][zh]concat=n=3:v=0:a=1,loudnorm=I=-18:TP=-3:LRA=7[out]",
      "-map", "[out]", "-ar", "22050", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1", fileURLToPath(file)]);
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", fileURLToPath(file)], { encoding: "utf8" }).trim());
    assets.push({ ...phrase, file: phrase.id + ".mp3", duration, sha256: createHash("sha256").update(await readFile(file)).digest("hex") });
  }
  await writeFile(new URL("manifest.json", output), JSON.stringify({ schemaVersion: 1, generator: "macOS say + ffmpeg; English, 320ms pause, Chinese", voices: catalog.voices, assets }, null, 2) + "\n");
} finally { await rm(scratch, { recursive: true, force: true }); }
console.log("Generated " + assets.length + " complete bilingual gem encouragement recordings.");
