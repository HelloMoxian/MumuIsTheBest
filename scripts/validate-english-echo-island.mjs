import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const catalogPath = resolve(projectRoot, "content", "english", "echo-island.v1.json");
const audioArchivePath = resolve(projectRoot, "content", "english", "echo-island-audio.v1.tar");
const ID_PATTERN = /^echo-\d{4}$/;
const AUDIO_PATTERN = /^\d{4}\.mp3$/;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function isMp3Header(bytes) {
  return (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}

function readTarEntries(archive) {
  const entries = new Map();
  let offset = 0;
  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const rawSize = header.subarray(124, 136).toString("ascii").replace(/\0.*$/s, "").trim();
    const size = Number.parseInt(rawSize, 8);
    check(name.length > 0 && Number.isSafeInteger(size) && size >= 0, "音频 TAR 目录项无效。");
    const dataOffset = offset + 512;
    check(dataOffset + size <= archive.byteLength, `音频 TAR 目录项越界：${name}`);
    check(!entries.has(name), `音频 TAR 目录项重复：${name}`);
    entries.set(name, archive.subarray(dataOffset, dataOffset + size));
    offset = dataOffset + Math.ceil(size / 512) * 512;
  }
  return entries;
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const audioEntries = readTarEntries(await readFile(audioArchivePath));
check(catalog.schemaVersion === 1, "英语回声岛目录 schemaVersion 必须是 1。");
check(catalog.catalogId === "mumu-english-echo-island-v1", "英语回声岛目录 ID 不正确。");
check(catalog.sentences.length === 1_000, "英语回声岛必须包含 1000 句。");
check(catalog.counts.sentences === 1_000, "目录句子计数不正确。");
check(catalog.counts.audioFiles === 2_000, "目录音频计数不正确。");
check(catalog.learningRules.initialPoolSize === 20, "初始随机池必须是 20 句。");
check(catalog.learningRules.masteryCompletionCount === 50, "掌握阈值必须是 50 次。");
check(catalog.learningRules.reviewEveryRegularCompletions === 5, "复习间隔必须是 5 句。");
check(catalog.learningRules.criticalHitChance === 0.15, "知识币暴击概率必须是 15%。");
check(catalog.learningRules.criticalHitMultiplier === 5, "知识币暴击倍率必须是五倍。");
check(audioEntries.size === 2_000, "音频 TAR 必须包含 2000 个目录项。");

const ids = new Set();
const sourceFiles = new Set();
for (const [index, sentence] of catalog.sentences.entries()) {
  check(ID_PATTERN.test(sentence.id), `第 ${index + 1} 句 ID 格式不正确。`);
  check(sentence.id === `echo-${String(index + 1).padStart(4, "0")}`, `第 ${index + 1} 句 ID 不连续。`);
  check(!ids.has(sentence.id), `句子 ID 重复：${sentence.id}`);
  ids.add(sentence.id);
  check(typeof sentence.english === "string" && /[.!?]$/.test(sentence.english), `${sentence.id} 不是完整英文表达。`);
  check(typeof sentence.chinese === "string" && sentence.chinese.length > 1, `${sentence.id} 缺少中文翻译。`);
  check(!sentence.english.includes("/"), `${sentence.id} 含有会让文字与美式录音不一致的并列变体。`);
  check(AUDIO_PATTERN.test(sentence.audio.sourceFile), `${sentence.id} 的源音频编号不正确。`);
  check(!sourceFiles.has(sentence.audio.sourceFile), `源音频编号重复：${sentence.audio.sourceFile}`);
  sourceFiles.add(sentence.audio.sourceFile);

  for (const directory of ["en", "zh"]) {
    const name = `${directory}/${sentence.audio.sourceFile}`;
    const audio = audioEntries.get(name);
    check(audio && audio.byteLength >= 1_000, `${name} 缺失或过小。`);
    check(isMp3Header(audio.subarray(0, 3)), `${name} 不是有效的 MP3 文件头。`);
  }
}

console.info(`英语回声岛校验通过：${catalog.sentences.length} 句，${catalog.counts.audioFiles} 个双语 MP3。`);
