import assert from "node:assert/strict";
import test from "node:test";
import { KEY_BINDINGS } from "./logic";
import { allowedKey, KEYBOARD_STORAGE, loadKeyboard, saveKeyboard, validateBindings, rebindKeyboard } from "./keyboard";

test("浏览器键位空记录、保存与恢复、时间元数据", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  assert.deepEqual(loadKeyboard(storage), KEY_BINDINGS);
  const bindings: Record<string, (typeof KEY_BINDINGS)[string]> = { ...KEY_BINDINGS, KeyF: KEY_BINDINGS.KeyS }; delete bindings.KeyS;
  saveKeyboard(storage, bindings);
  assert.deepEqual(loadKeyboard(storage), bindings);
  const first = JSON.parse(data.get(KEYBOARD_STORAGE)!);
  saveKeyboard(storage, KEY_BINDINGS);
  assert.equal(JSON.parse(data.get(KEYBOARD_STORAGE)!).createdAt, first.createdAt);
  assert.equal(first.schemaVersion, 1);
});
test("拒绝损坏、未来版本、重复动作、非法键位，不自动覆盖", () => {
  for (const raw of ["{", "null", '{}', '{"schemaVersion":2}']) assert.throws(() => loadKeyboard({ getItem: () => raw }));
  for (const value of [null, [], {}, { ...KEY_BINDINGS, KeyA: [0, "down"] }, { ...KEY_BINDINGS, Escape: [0, "left"] }]) assert.throws(() => validateBindings(value));
  assert.equal(allowedKey("KeyP"), false);
  assert.equal(allowedKey("Tab"), false);
  assert.equal(allowedKey("ArrowUp"), true);
  assert.equal(allowedKey("KeyF"), true);
});
test("浏览器读取或写入失败由调用者显示提示，不伪装保存成功", () => {
  assert.throws(() => loadKeyboard({ getItem: () => { throw new Error("blocked"); } }));
  assert.throws(() => saveKeyboard({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, KEY_BINDINGS));
});

test("换成方向键时可明确互换另一玩家的占用键，不丢失任何动作", () => {
  const next = rebindKeyboard(KEY_BINDINGS, 0, "left", "ArrowLeft");
  assert.deepEqual(next.ArrowLeft, [0, "left"]);
  assert.deepEqual(next.KeyA, [1, "left"]);
  assert.equal(Object.keys(next).length, 12);
  assert.deepEqual(rebindKeyboard(next, 0, "left", "ArrowLeft"), next);
  assert.throws(() => rebindKeyboard(next, 0, "left", "Escape"));
});
