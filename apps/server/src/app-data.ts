import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  readdir,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function defaultAppDataDirectory(projectRoot: string) {
  return resolve(projectRoot, "..", "data");
}

export function resolveAppDataDirectory(
  projectRoot: string,
  configuredDirectory = process.env.APP_DATA_DIR,
) {
  const configured = configuredDirectory?.trim();
  if (!configured) return defaultAppDataDirectory(projectRoot);
  if (!isAbsolute(configured)) {
    throw new Error("APP_DATA_DIR 必须是仓库外的绝对路径。");
  }
  const resolvedDirectory = resolve(configured);
  const relativeToProject = relative(resolve(projectRoot), resolvedDirectory);
  if (
    relativeToProject === ""
    || (!relativeToProject.startsWith("..") && !isAbsolute(relativeToProject))
  ) {
    throw new Error("APP_DATA_DIR 必须位于 Git 仓库之外。");
  }
  return resolvedDirectory;
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function copyMissingEntries(source: string, destination: string): Promise<number> {
  const sourceStat = await lstat(source);
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`旧数据目录中包含不允许迁移的符号链接：${source}`);
  }
  if (sourceStat.isDirectory()) {
    await mkdir(destination, { recursive: true, mode: 0o700 });
    await chmod(destination, 0o700);
    let copiedFiles = 0;
    for (const entry of await readdir(source)) {
      copiedFiles += await copyMissingEntries(
        resolve(source, entry),
        resolve(destination, entry),
      );
    }
    return copiedFiles;
  }
  if (!sourceStat.isFile() || await pathExists(destination)) return 0;

  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporaryPath = `${destination}.${randomUUID()}.migration.tmp`;
  await copyFile(source, temporaryPath, constants.COPYFILE_EXCL);
  await chmod(temporaryPath, 0o600);
  try {
    await link(temporaryPath, destination);
    await chmod(destination, 0o600);
    return 1;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return 0;
    throw error;
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function initializeAppDataDirectory(options: {
  appDataDir: string;
  legacyDataDir?: string;
}) {
  await mkdir(options.appDataDir, { recursive: true, mode: 0o700 });
  const dataStat = await lstat(options.appDataDir);
  if (!dataStat.isDirectory() || dataStat.isSymbolicLink()) {
    throw new Error(`本机数据路径不是安全目录：${options.appDataDir}`);
  }
  await chmod(options.appDataDir, 0o700);

  if (
    !options.legacyDataDir
    || resolve(options.legacyDataDir) === resolve(options.appDataDir)
    || !await pathExists(options.legacyDataDir)
  ) {
    return { copiedFiles: 0 };
  }

  const copiedFiles = await copyMissingEntries(
    options.legacyDataDir,
    options.appDataDir,
  );
  return { copiedFiles };
}
