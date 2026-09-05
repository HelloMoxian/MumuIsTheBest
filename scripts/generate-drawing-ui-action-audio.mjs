import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "content/drawing-studio/ui-action-speech.v1.json");
const defaultOutputDirectory = join(repositoryRoot, "apps/web/public/audio/ui-actions/drawing-studio");

function optionValue(name) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1];
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function validateCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.actions)) {
    throw new Error("UI action speech catalog has an unsupported schema.");
  }
  if (
    typeof catalog.voices?.zh !== "string"
    || typeof catalog.voices?.en !== "string"
    || !Number.isFinite(catalog.speechRate)
    || !Number.isFinite(catalog.pauseMs)
  ) throw new Error("UI action speech catalog settings are incomplete.");

  const ids = new Set();
  for (const action of catalog.actions) {
    if (
      typeof action?.id !== "string"
      || !/^[a-z0-9-]+$/.test(action.id)
      || typeof action.zh !== "string"
      || typeof action.en !== "string"
      || !action.zh.trim()
      || !action.en.trim()
      || action.zh.includes("[[")
      || action.en.includes("[[")
      || ids.has(action.id)
    ) throw new Error(`Invalid or duplicate UI speech action: ${String(action?.id)}`);
    ids.add(action.id);
  }
  return catalog;
}

const catalog = validateCatalog(JSON.parse(await readFile(catalogPath, "utf8")));
const outputDirectory = resolve(optionValue("--output-dir") ?? defaultOutputDirectory);
const requestedId = optionValue("--id");
const actions = requestedId
  ? catalog.actions.filter((action) => action.id === requestedId)
  : catalog.actions;
if (requestedId && actions.length !== 1) throw new Error(`Unknown action id: ${requestedId}`);

await mkdir(outputDirectory, { recursive: true });
const workspace = await mkdtemp(join(tmpdir(), "mumu-drawing-ui-audio-"));
try {
  for (const action of actions) {
    const chinesePath = join(workspace, `${action.id}-zh.aiff`);
    const englishPath = join(workspace, `${action.id}-en.aiff`);
    const temporaryOutput = join(outputDirectory, `.${action.id}.${process.pid}.tmp.m4a`);
    const finalOutput = join(outputDirectory, `${action.id}.m4a`);

    await run("say", [
      "-v", catalog.voices.zh,
      "-r", String(catalog.speechRate),
      "-o", chinesePath,
      action.zh,
    ]);
    await run("say", [
      "-v", catalog.voices.en,
      "-r", String(catalog.speechRate),
      "-o", englishPath,
      action.en,
    ]);
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", chinesePath,
      "-f", "lavfi", "-i", `anullsrc=r=22050:cl=mono:d=${catalog.pauseMs / 1000}`,
      "-i", englishPath,
      "-filter_complex",
      "[0:a]aresample=22050,aformat=sample_fmts=fltp:channel_layouts=mono[zh];"
        + "[1:a]aresample=22050,aformat=sample_fmts=fltp:channel_layouts=mono[pause];"
        + "[2:a]aresample=22050,aformat=sample_fmts=fltp:channel_layouts=mono[en];"
        + "[zh][pause][en]concat=n=3:v=0:a=1[out]",
      "-map", "[out]",
      "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
      temporaryOutput,
    ]);
    await rename(temporaryOutput, finalOutput);
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}

console.log(`Generated ${actions.length} clean bilingual UI action recordings in ${outputDirectory}`);
