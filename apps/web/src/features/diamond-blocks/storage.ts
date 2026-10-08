import { level, validGame, type Game } from "./logic";
export const STORAGE_KEY = "mumu.diamond-blocks.v1";
export const LEGACY_BACKUP_KEY = "mumu.diamond-blocks.before-v2";
export type Save = { schemaVersion: 2; id: string; createdAt: string; updatedAt: string; revision: number; game: Game };
export interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function decode(raw: string): Save {
  const v = JSON.parse(raw) as Omit<Save, "schemaVersion"> & { schemaVersion: unknown };
  if (!v || (v.schemaVersion !== 1 && v.schemaVersion !== 2) || typeof v.id !== "string" || !v.id
    || typeof v.createdAt !== "string" || !Number.isFinite(Date.parse(v.createdAt))
    || typeof v.updatedAt !== "string" || !Number.isFinite(Date.parse(v.updatedAt))
    || !Number.isSafeInteger(v.revision) || v.revision < 0 || !validGame(v.game, v.schemaVersion === 1)) throw new Error("缓存损坏或来自较新版本，已保留原缓存");
  const game = v.schemaVersion === 1 ? { ...v.game, rewardLevel: level(v.game), pendingPrisms: 0, scene: 0, clearColor: null } : v.game;
  return { ...v, schemaVersion: 2, game };
}
/** Single-key atomic snapshot. Compare the raw prior value to catch another tab's writes. */
export class GameStore {
  private expected: string | null = null;
  private save: Save | null = null;
  private blocked = false;
  constructor(private storage: Storage) {}
  read(): Save | null {
    try {
      this.expected = this.storage.getItem(STORAGE_KEY);
      this.save = this.expected === null ? null : decode(this.expected);
      return this.save;
    } catch (error) { this.blocked = true; throw error; }
  }
  write(game: Game): Save {
    if (this.blocked) throw new Error("已保护原缓存，请先选择重新读取或确认替换缓存");
    if (!validGame(game)) throw new Error("当前进度无法校验，尚未保存");
    if (this.storage.getItem(STORAGE_KEY) !== this.expected) {
      this.blocked = true;
      throw new Error("另一个页面更新了进度，已暂停自动保存，请重新读取");
    }
    const now = new Date().toISOString();
    const next: Save = { schemaVersion: 2, id: this.save?.id ?? crypto.randomUUID(),
      createdAt: this.save?.createdAt ?? now, updatedAt: now, revision: (this.save?.revision ?? 0) + 1, game };
    const raw = JSON.stringify(next);
    if (this.expected && this.save && JSON.parse(this.expected).schemaVersion === 1 && this.storage.getItem(LEGACY_BACKUP_KEY) === null) {
      this.storage.setItem(LEGACY_BACKUP_KEY, this.expected);
    }
    this.storage.setItem(STORAGE_KEY, raw);
    this.expected = raw; this.save = next;
    return next;
  }
  /** Called only after the user explicitly confirms replacing the saved snapshot. */
  replace(game: Game) {
    this.expected = this.storage.getItem(STORAGE_KEY); this.blocked = false; this.save = null;
    return this.write(game);
  }
}
