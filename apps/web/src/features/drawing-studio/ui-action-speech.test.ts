import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import speechCatalog from "../../../../../content/drawing-studio/ui-action-speech.v1.json";

const audioDirectory = fileURLToPath(new URL(
  "../../../public/audio/ui-actions/drawing-studio/",
  import.meta.url,
));

test("drawing action speech uses concise direct translations with one asset per phrase", async () => {
  assert.equal(speechCatalog.schemaVersion, 1);
  assert.equal(speechCatalog.actions.length, 39);
  assert.equal(new Set(speechCatalog.actions.map((action) => action.id)).size, 39);
  assert.deepEqual(speechCatalog.actions.find((action) => action.id === "tool-select"), {
    id: "tool-select",
    zh: "选择",
    en: "Select",
  });

  for (const action of speechCatalog.actions) {
    assert.match(action.id, /^[a-z0-9-]+$/);
    assert.ok(action.zh.trim().length > 0);
    assert.ok(action.en.trim().length > 0);
    assert.ok(action.en.trim().split(/\s+/).length <= 3);
    assert.doesNotMatch(`${action.zh} ${action.en}`, /voice|samantha|tingting|\[\[|\]\]/i);
  }

  const expectedFiles = speechCatalog.actions.map((action) => `${action.id}.m4a`).sort();
  const actualFiles = (await readdir(audioDirectory)).filter((file) => file.endsWith(".m4a")).sort();
  assert.deepEqual(actualFiles, expectedFiles);
  for (const file of actualFiles) {
    assert.ok((await stat(fileURLToPath(new URL(file, new URL(
      "../../../public/audio/ui-actions/drawing-studio/",
      import.meta.url,
    ))))).size > 1_000);
  }
});
