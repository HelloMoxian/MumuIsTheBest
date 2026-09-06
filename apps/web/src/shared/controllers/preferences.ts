import { EMPTY_CONTROLLER_PREFERENCES } from "../../../../server/src/game-controller-preferences";
import { loadPersistentData, queuePersistentDataWrite } from "../persistent-data";
import { parseControllerPreferences, type ControllerPreferences, type GameControls } from "./registry";

export type PreferencesState = { preferences: ControllerPreferences; status: "loading" | "ready" | "saving" | "saved" | "read-error" | "write-error"; message: string };
type Fetcher = typeof fetch;
export class ControllerPreferencesStore {
  private state: PreferencesState = { preferences: EMPTY_CONTROLLER_PREFERENCES, status: "loading", message: "正在读取控制设置…" };
  private listeners = new Set<() => void>();
  private loading?: Promise<void>;
  private loaded = false;
  private revision = 0;
  private pendingGames: Record<string, GameControls> = {};
  constructor(private fetcher: Fetcher = (...args) => fetch(...args)) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: PreferencesState) { this.state = state; this.listeners.forEach(listener => listener()); }
  load = (): Promise<void> => {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.publish({ ...this.state, status: "loading", message: "正在读取控制设置…" });
    this.loading = loadPersistentData({ stableId: "game-controller-preferences", parsePayload: parseControllerPreferences }, this.fetcher)
      .then(async record => {
        this.loaded = true;
        const preferences: ControllerPreferences = { schemaVersion: 1, games: { ...record?.payload.games, ...this.pendingGames } };
        this.publish({ preferences, status: "ready", message: record ? "已恢复本机控制设置" : "选择后自动保存在本机" });
        if (Object.keys(this.pendingGames).length) await this.save();
      }).catch(() => this.publish({ ...this.state, status: "read-error", message: "设置暂时读不到，可先玩；本次修改尚未保存。" }))
      .finally(() => { this.loading = undefined; });
    return this.loading;
  };
  update(gameId: string, config: GameControls) {
    if (this.state.status === "loading") return;
    const preferences = parseControllerPreferences({ ...this.state.preferences, games: { ...this.state.preferences.games, [gameId]: config } });
    if (!preferences) throw new Error("控制设置不完整，或同一手柄分配给了两位玩家。");
    this.pendingGames[gameId] = config;
    this.publish({ ...this.state, preferences });
    if (this.loaded) void this.save();
  }
  retry = () => this.loaded ? this.save() : this.load();
  private async save() {
    const revision = ++this.revision;
    this.publish({ ...this.state, status: "saving", message: "正在保存控制设置…" });
    try {
      const result = await queuePersistentDataWrite<ControllerPreferences>("game-controller-preferences", { schemaVersion: 1, games: { ...this.pendingGames } }, parseControllerPreferences, this.fetcher);
      if (revision === this.revision) {
        this.pendingGames = {};
        this.publish({ preferences: result.payload, status: "saved", message: "✓ 控制设置已保存在本机" });
      }
    } catch {
      if (revision === this.revision) this.publish({ ...this.state, status: "write-error", message: "本次设置可用，但尚未保存。请重试。" });
    }
  }
}
export const controllerPreferences = new ControllerPreferencesStore();
