import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const catalogPath = resolve(projectRoot, "content", "english", "echo-island.v1.json");
const defaultOutputPath = resolve(projectRoot, "content", "english", "echo-island-audio.v1.tar");
const SOURCE_CODES = { en: "EM", zh: "ZH" };
const MINIMUM_MP3_BYTES = 1_000;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function numberArgument(name, fallback) {
  const value = Number(argument(name, fallback));
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} 必须是正整数。`);
  return value;
}

function isMp3Header(bytes) {
  return (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}

function writeString(target, offset, length, value) {
  Buffer.from(value, "utf8").copy(target, offset, 0, length);
}

function writeOctal(target, offset, length, value) {
  writeString(target, offset, length, `${value.toString(8).padStart(length - 1, "0")}\0`);
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 265, 32, "mumu");
  writeString(header, 297, 32, "mumu");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

async function downloadMp3(task) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(task.sourceUrl, {
        headers: { "User-Agent": "Mumu-English-Echo-Island/1.0 (personal study)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("audio")) {
        throw new Error(`unexpected content type: ${contentType || "missing"}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength < MINIMUM_MP3_BYTES || !isMp3Header(bytes)) {
        throw new Error(`invalid MP3 payload (${bytes.byteLength} bytes)`);
      }
      return { ...task, bytes };
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolveWait) => setTimeout(resolveWait, attempt * 500));
      }
    }
  }
  throw new Error(`${task.name}: ${lastError?.message ?? "下载失败"}`);
}

async function main() {
  const outputPath = resolve(argument("--output", defaultOutputPath));
  const concurrency = Math.max(1, Math.min(24, numberArgument("--concurrency", 20)));
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const tasks = catalog.sentences.flatMap((sentence) =>
    Object.entries(SOURCE_CODES).map(([language, sourceCode]) => ({
      name: `${language}/${sentence.audio.sourceFile}`,
      sourceUrl: `https://www.book2.nl/book2/${sourceCode}/SOUND/${sentence.audio.sourceFile}`,
    })),
  );

  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "mumu-echo-audio-"));
  const temporaryPath = resolve(temporaryDirectory, `${randomUUID()}.tar`);
  const archive = await open(temporaryPath, "w", 0o644);
  let downloaded = 0;

  try {
    for (let start = 0; start < tasks.length; start += concurrency) {
      const results = await Promise.all(tasks.slice(start, start + concurrency).map(downloadMp3));
      for (const result of results) {
        await archive.write(tarHeader(result.name, result.bytes.byteLength));
        await archive.write(result.bytes);
        const padding = (512 - (result.bytes.byteLength % 512)) % 512;
        if (padding) await archive.write(Buffer.alloc(padding));
        downloaded += 1;
      }
      if (downloaded % 100 === 0 || downloaded === tasks.length) {
        console.info(`已装入 ${downloaded}/${tasks.length} 个真人 MP3。`);
      }
    }
    await archive.write(Buffer.alloc(1_024));
  } finally {
    await archive.close();
  }

  try {
    await copyFile(temporaryPath, outputPath);
    const archiveStat = await stat(outputPath);
    console.info(`完成：${catalog.sentences.length} 句，${tasks.length} 个双语 MP3，${archiveStat.size} 字节。`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
