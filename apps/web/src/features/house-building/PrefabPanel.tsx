import { useEffect, useRef, useState } from "react";
import {
  loadPersistentData,
  savePersistentData,
} from "../../shared/persistent-data";
import {
  parseHousePrefabs,
  type HousePrefab,
  type HousePrefabs,
} from "../../../../server/src/house-building-prefabs";
import { SYSTEM_PREFABS, systemPrefab } from "./prefabs";
import type { HouseDesign, MaterialId } from "./model";
export function PrefabPanel({
  selection,
  material,
  onInsert,
}: {
  selection?: HouseDesign;
  material: MaterialId;
  onInsert: (d: HouseDesign) => void;
}) {
  const [library, setLibrary] = useState<HousePrefabs>(),
    [error, setError] = useState(""),
    [name, setName] = useState("我的组合"),
    [busy, setBusy] = useState(false);
  const pending = useRef<HousePrefab | undefined>(undefined),
    lock = useRef(false);
  const read = async () => {
    try {
      const value = await loadPersistentData({
        stableId: "physics-house-prefabs",
        parsePayload: parseHousePrefabs,
      });
      setLibrary(value?.payload ?? { schemaVersion: 1, prefabs: [] });
      setError("");
    } catch {
      setError("预制件读取失败，请重试。");
    }
  };
  useEffect(() => {
    void read();
  }, []);
  const save = async () => {
    if (
      lock.current ||
      !library ||
      (!pending.current && (!selection || !name.trim()))
    )
      return;
    const p = pending.current ?? {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      design: structuredClone(selection!),
    };
    pending.current = p;
    lock.current = true;
    setBusy(true);
    try {
      const value = await savePersistentData<HousePrefabs>(
        "physics-house-prefabs",
        { schemaVersion: 1, prefabs: [p] },
        parseHousePrefabs,
      );
      setLibrary(value.payload);
      pending.current = undefined;
      setError("");
    } catch {
      setError("保存未确认，可重试同一次保存。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="house-prefabs">
      <h3>组合预制件</h3>
      <p className="house-hint">放入后每块可单独拖动，不会自动粘在一起。</p>
      <div className="house-tools">
        {SYSTEM_PREFABS.map((p) => (
          <button
            className="button button-secondary"
            key={p.id}
            onClick={() => onInsert(systemPrefab(p.id, material))}
          >
            {p.name}
          </button>
        ))}
      </div>
      <label>
        组合名称
        <input
          aria-label="组合名称"
          maxLength={60}
          value={name}
          disabled={busy || !!pending.current}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        className="button button-secondary"
        disabled={
          busy ||
          !library ||
          (!pending.current && (!selection || !name.trim())) ||
          library.prefabs.length >= 100
        }
        onClick={() => void save()}
      >
        {busy ? "保存中…" : pending.current ? "重试保存" : "选中积木存为预制件"}
      </button>
      {error && (
        <p role="alert">
          {error}
          {!library && (
            <button className="button button-ghost" onClick={() => void read()}>
              重试读取
            </button>
          )}
        </p>
      )}
      {library?.prefabs.map((p) => (
        <button
          key={p.id}
          className="button button-secondary"
          onClick={() => onInsert(p.design)}
        >
          {p.name} · {p.design.parts.length} 块
        </button>
      ))}
    </section>
  );
}
