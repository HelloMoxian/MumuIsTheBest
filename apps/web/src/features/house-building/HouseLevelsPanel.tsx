import { useEffect, useRef, useState } from "react";
import {
  loadPersistentData,
  savePersistentData,
} from "../../shared/persistent-data";
import {
  parseHouseLevels,
  levelName,
  type HouseLevel,
  type HouseLevels,
} from "../../../../server/src/house-building-levels";
import type { HouseWorkspace } from "./challenge";

const stableId = "physics-house-levels";
export function HouseLevelsPanel({
  workspace,
  onLoad,
}: {
  workspace: HouseWorkspace;
  onLoad: (workspace: HouseWorkspace, name: string) => void;
}) {
  const [library, setLibrary] = useState<HouseLevels>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState("");
  const pending = useRef<HouseLevel | undefined>(undefined);
  const lock = useRef(false);
  const read = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await loadPersistentData({
        stableId,
        parsePayload: parseHouseLevels,
      });
      setLibrary(saved?.payload ?? { schemaVersion: 1, levels: [] });
      pending.current = undefined;
    } catch {
      setError("关卡暂时无法读取，请重试。原有记录不会被覆盖。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    void read();
  }, []);
  const persist = async (level: HouseLevel) => {
    if (lock.current) return;
    lock.current = true;
    pending.current = level;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await savePersistentData<HouseLevels>(
        stableId,
        { schemaVersion: 1, levels: [level] },
        parseHouseLevels,
      );
      setLibrary(saved.payload);
      pending.current = undefined;
      setEditing(undefined);
      setMessage(
        `已保存「${saved.payload.levels.find((x) => x.id === level.id)?.name ?? level.name}」`,
      );
    } catch {
      setError(
        "保存未确认。可重试本次保存；若关卡已在其他页面修改，请重新读取。",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const saveNew = () => {
    if (!library || pending.current) return;
    let n = library.levels.length + 1;
    while (library.levels.some((x) => x.name === levelName(n))) n++;
    const now = new Date().toISOString();
    void persist({
      id: crypto.randomUUID(),
      name: levelName(n),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      workspace: structuredClone(workspace),
    });
  };
  return (
    <section className="house-levels">
      <h2>我的关卡</h2>
      <p className="house-hint">
        保存搭建方案、任务条件和风震设置，下次载入后继续搭建或挑战。
      </p>
      <button
        className="button button-primary"
        disabled={
          !library || busy || !!pending.current || library.levels.length >= 500
        }
        onClick={saveNew}
      >
        保存当前为新关卡
      </button>
      <p className="house-hint" role="status">
        {busy ? "正在处理…" : message}
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <div className="house-button-row">
            {pending.current && (
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  if (pending.current) void persist(pending.current);
                }}
              >
                重试保存
              </button>
            )}
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => void read()}
            >
              重新读取
            </button>
          </div>
        </div>
      )}
      {library?.levels.length === 0 && (
        <p className="house-hint">
          还没有关卡。保存后会自动命名为关卡一、关卡二……
        </p>
      )}
      {library?.levels.map((level) => (
        <article className="house-level-card" key={level.id}>
          {editing === level.id ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim() || busy || pending.current) return;
                void persist({
                  ...level,
                  name: name.trim(),
                  revision: level.revision + 1,
                  updatedAt: new Date(
                    Math.max(Date.now(), Date.parse(level.updatedAt)),
                  ).toISOString(),
                });
              }}
            >
              <input
                aria-label="关卡名称"
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                disabled={busy || !!pending.current}
              />
              <div className="house-button-row">
                <button
                  className="button button-secondary"
                  disabled={busy || !name.trim() || !!pending.current}
                >
                  保存名称
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy || !!pending.current}
                  onClick={() => setEditing(undefined)}
                >
                  取消
                </button>
              </div>
            </form>
          ) : (
            <>
              <h3>{level.name}</h3>
              <p className="house-hint">
                {level.workspace.design.parts.length} 块积木 ·{" "}
                {new Date(level.updatedAt).toLocaleDateString()}
              </p>
              <div className="house-button-row">
                <button
                  className="button button-secondary"
                  disabled={busy || !!pending.current}
                  onClick={() =>
                    onLoad(structuredClone(level.workspace), level.name)
                  }
                >
                  载入关卡
                </button>
                <button
                  className="button button-secondary"
                  disabled={busy || !!pending.current}
                  onClick={() => {
                    setEditing(level.id);
                    setName(level.name);
                  }}
                >
                  重命名
                </button>
              </div>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
