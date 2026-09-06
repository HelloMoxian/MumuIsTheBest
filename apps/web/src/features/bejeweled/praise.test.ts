import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createGame, type Frame } from "../../../../server/src/bejeweled-engine";
import { GEM_PRAISES, createGemPraisePicker } from "./praise";
test("all 16 complete bilingual recordings are bundled and match their generation manifest", async () => {
  const root = new URL("../../../public/audio/bejeweled/praise/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(GEM_PRAISES.length, 16);
  assert.equal(new Set(GEM_PRAISES.map(p => p.id)).size, 16);
  for (const praise of GEM_PRAISES) {
    const asset = manifest.assets.find((item: { id: string }) => item.id === praise.id);
    assert.ok(asset); assert.equal(asset.en, praise.en); assert.equal(asset.zh, praise.zh);
    const audio = await readFile(new URL(praise.id + ".mp3", root));
    assert.equal(createHash("sha256").update(audio).digest("hex"), asset.sha256);
    assert.ok(audio.length > 5000); assert.ok(asset.duration > 1);
  }
});
test("encouragement matches new specials and cascades, and avoids consecutive ordinary repeats", () => {
  const pick = createGemPraisePicker(() => 0);
  const frame: Frame = { board: createGame(17).board, cleared: [0,1,2], created: [], points: 150, cascade: 1, phase: "clear" };
  assert.equal(pick(frame).kind, "match");
  assert.notEqual(pick(frame).id, pick(frame).id);
  assert.equal(pick({ ...frame, cascade: 3 }).kind, "cascade");
  for (const special of ["flame", "star", "cube", "nova"] as const) {
    frame.board[0]!.special = special;
    assert.equal(pick({ ...frame, created: [0] }).kind, special);
    assert.equal(pick({ ...frame, blasts: [{ source: 0, kind: special, targets: [0] }] }).kind, special);
  }
});
