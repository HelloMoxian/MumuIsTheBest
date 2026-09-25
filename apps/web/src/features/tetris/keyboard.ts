import { KEY_BINDINGS, type Action } from "./logic";
import type { KeyBindings } from "./input";

export const KEYBOARD_STORAGE = "mumu.tetris.keyboard.v1";
export const KEY_ACTIONS: { action: Action; label: string }[] = [
  { action: "left", label: "左移" }, { action: "down", label: "下落一格" },
  { action: "right", label: "右移" }, { action: "rotate", label: "变形（右旋）" },
  { action: "reverse", label: "左旋" }, { action: "drop", label: "瞬间落底" },
];
export function keyLabel(code: string) {
  return ({ ArrowLeft: "←", ArrowRight: "→", ArrowDown: "↓", ArrowUp: "↑", Space: "空格" } as Record<string, string>)[code] ?? code.replace(/^Key|^Digit/, "");
}
export function keyFor(bindings: KeyBindings, player: number, action: Action) {
  return Object.keys(bindings).find(code => bindings[code][0] === player && bindings[code][1] === action)!;
}
export function allowedKey(code: string) {
  return code !== "KeyP" && /^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Enter|Numpad[0-9]|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal)$/.test(code);
}
export function validateBindings(value: unknown): KeyBindings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("键位记录不可用");
  const entries = Object.entries(value);
  if (entries.length !== 12) throw new Error("键位记录不完整");
  const pairs = new Set<string>();
  for (const [code, binding] of entries) {
    if (!allowedKey(code) || !Array.isArray(binding) || binding.length !== 2 || ![0, 1].includes(binding[0]) || !KEY_ACTIONS.some(a => a.action === binding[1])) throw new Error("键位记录不可用");
    pairs.add(binding.join(":"));
  }
  if (pairs.size !== 12) throw new Error("键位重复");
  return value as KeyBindings;
}
export function loadKeyboard(storage: Pick<Storage, "getItem">): KeyBindings {
  const raw = storage.getItem(KEYBOARD_STORAGE);
  if (!raw) return KEY_BINDINGS;
  const record = JSON.parse(raw);
  if (record.schemaVersion !== 1 || record.stableId !== "tetris-keyboard" || !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error("键位版本不可用");
  return validateBindings(record.bindings);
}
export function saveKeyboard(storage: Pick<Storage, "getItem" | "setItem">, bindings: KeyBindings) {
  validateBindings(bindings);
  const now = new Date().toISOString();
  let createdAt = now;
  try { const old = JSON.parse(storage.getItem(KEYBOARD_STORAGE) ?? "null"); if (old?.schemaVersion === 1 && Number.isFinite(Date.parse(old.createdAt))) createdAt = old.createdAt; } catch { /* Explicit save replaces malformed settings. */ }
  storage.setItem(KEYBOARD_STORAGE, JSON.stringify({ schemaVersion: 1, stableId: "tetris-keyboard", createdAt, updatedAt: now, bindings }));
}

export function rebindKeyboard(bindings: KeyBindings, player: number, action: Action, code: string): KeyBindings {
  if (!allowedKey(code)) throw new Error("这个键不可用");
  const old = keyFor(bindings, player, action);
  if (!old) throw new Error("动作不可用");
  const next = { ...bindings };
  delete next[old];
  if (bindings[code] && code !== old) next[old] = bindings[code];
  next[code] = [player, action];
  return validateBindings(next);
}
