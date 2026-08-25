import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import {
  defaultAppDataDirectory,
  initializeAppDataDirectory,
  resolveAppDataDirectory,
} from "./app-data.js";

const cleanupPaths: string[] = [];

after(async () => {
  await Promise.all(cleanupPaths.map((path) => rm(path, { recursive: true, force: true })));
});

describe("app data directory", () => {
  it("defaults to a data directory beside the repository", () => {
    const projectRoot = resolve("/workspace", "MumuIsTheBest");
    assert.equal(defaultAppDataDirectory(projectRoot), resolve("/workspace", "data"));
    assert.equal(resolveAppDataDirectory(projectRoot, ""), resolve("/workspace", "data"));
  });

  it("accepts only absolute APP_DATA_DIR overrides", () => {
    assert.equal(
      resolveAppDataDirectory("/workspace/MumuIsTheBest", "/safe/mumu-data"),
      resolve("/safe/mumu-data"),
    );
    assert.throws(
      () => resolveAppDataDirectory("/workspace/MumuIsTheBest", "relative-data"),
      /绝对路径/,
    );
    assert.throws(
      () => resolveAppDataDirectory(
        "/workspace/MumuIsTheBest",
        "/workspace/MumuIsTheBest/var",
      ),
      /Git 仓库之外/,
    );
  });

  it("creates a private directory and migrates only missing legacy files", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "mumu-app-data-"));
    cleanupPaths.push(parent);
    const legacy = resolve(parent, "repository", "var");
    const destination = resolve(parent, "data");
    await mkdir(resolve(legacy, "learning", "math"), { recursive: true });
    await writeFile(resolve(legacy, "learning", "math", "history.json"), "legacy\n");
    await mkdir(resolve(destination, "learning", "math"), { recursive: true });
    await writeFile(resolve(destination, "learning", "math", "keep.json"), "current\n");

    const first = await initializeAppDataDirectory({
      appDataDir: destination,
      legacyDataDir: legacy,
    });
    assert.equal(first.copiedFiles, 1);
    assert.equal(
      await readFile(resolve(destination, "learning", "math", "history.json"), "utf8"),
      "legacy\n",
    );
    assert.equal(
      await readFile(resolve(destination, "learning", "math", "keep.json"), "utf8"),
      "current\n",
    );
    assert.equal((await stat(destination)).mode & 0o777, 0o700);
    assert.equal(
      (await stat(resolve(destination, "learning", "math", "history.json"))).mode & 0o777,
      0o600,
    );

    await writeFile(resolve(destination, "learning", "math", "history.json"), "newer\n");
    const second = await initializeAppDataDirectory({
      appDataDir: destination,
      legacyDataDir: legacy,
    });
    assert.equal(second.copiedFiles, 0);
    assert.equal(
      await readFile(resolve(destination, "learning", "math", "history.json"), "utf8"),
      "newer\n",
    );
  });
});
