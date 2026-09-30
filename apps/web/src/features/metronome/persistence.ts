import { parseMusicState, type MusicLibrary, type MusicState } from "./logic";
type Fetcher = typeof fetch;
export async function loadMusic(fetcher: Fetcher = fetch): Promise<MusicState | null> {
  const response = await fetcher("/api/metronome");
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message ?? "作品暂时无法读取，请重试。");
  if (body?.state === null) return null;
  const state = parseMusicState(body?.state);
  if (!state) throw new Error("作品版本不兼容，原文件已保留。");
  return state;
}
export type SaveStatus = "saved" | "saving" | "error";
export class MusicSaveQueue {
  private pending: MusicLibrary | null = null;
  private active: Promise<void> | null = null;
  private error: Error | null = null;
  constructor(private revision: number, private notify: (status: SaveStatus, error?: string) => void, private fetcher: Fetcher = fetch) {}
  get dirty() { return this.pending !== null || this.active !== null; }
  get message() { return this.error?.message; }
  enqueue(library: MusicLibrary) {
    this.pending = structuredClone(library);
    if (!this.error) void this.flush().catch(() => undefined);
  }
  async flush(): Promise<void> {
    if (this.active) return this.active;
    this.error = null;
    const operation = (async () => {
      while (this.pending) {
        const library = this.pending;
        this.pending = null; this.notify("saving");
        try {
          const request = this.fetcher;
          const response = await request("/api/metronome", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedRevision: this.revision, library }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body?.message ?? "作品还未保存，请重试。");
          const state = parseMusicState(body?.state);
          if (!state || state.revision !== this.revision + 1) throw new Error("保存结果暂时无法确认，请下载作品后重新打开。");
          this.revision = state.revision;
        } catch (error) {
          this.pending ??= library;
          this.error = error instanceof Error ? error : new Error("作品还未保存，请重试。");
          this.notify("error", this.error.message); throw this.error;
        }
      }
      this.notify("saved");
    })();
    this.active = operation;
    try { await operation; } finally { this.active = null; }
  }
}
