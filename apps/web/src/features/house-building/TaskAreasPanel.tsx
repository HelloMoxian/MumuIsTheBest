import { useState } from "react";
import { parseChallenge, type HouseChallenge } from "./challenge";
import { addTaskArea, type TaskDrawKind } from "./task-layout";
export function TaskAreasPanel({
  challenge: c,
  onChange,
  onDraw,
  drawing,
}: {
  challenge: HouseChallenge;
  onChange: (c: HouseChallenge) => void;
  onDraw: (kind: TaskDrawKind | undefined) => void;
  drawing?: TaskDrawKind;
}) {
  const labels = {
    required: "必经区域",
    forbidden: "禁入区域",
    foundation: "底部地基",
  };
  const [error, setError] = useState("");
  const update = (next: HouseChallenge) => {
    const parsed = parseChallenge({
      ...next,
      layoutVersion: 3,
      zones: next.zones ?? [],
    });
    if (!parsed) {
      setError("边界需在搭建台内，区域必须有宽度和高度，地基之间不能重叠。");
      return;
    }
    setError("");
    onChange(parsed);
  };
  return (
    <section className="house-task-areas">
      <h3>手动添加条件</h3>
      {error && <p role="alert">{error}</p>}
      <div className="house-button-row">
        {(["required", "forbidden", "foundation"] as const).map((kind) => (
          <button
            key={kind}
            className="button button-secondary"
            aria-pressed={drawing === kind}
            onClick={() => onDraw(drawing === kind ? undefined : kind)}
          >
            ＋ {labels[kind]}
          </button>
        ))}
      </div>
      <p className="house-hint">
        {drawing
          ? "在搭建台拖出范围；也可点击下面按钮直接添加，再调整位置和大小。"
          : "必经区域需要建筑接触；禁入区域不能有积木。地基固定在底部并随地震晃动。"}
      </p>
      {drawing && (
        <button
          className="button button-secondary"
          onClick={() => {
            let next = c;
            for (let x = -4; x <= 36 && next === c; x += 5)
              next = addTaskArea(
                c,
                drawing,
                { x, y: 2 },
                { x: x + 3, y: 4 },
                crypto.randomUUID(),
              );
            if (next === c) {
              setError(
                "这里没有可添加的位置，或区域数量已满，请先调整现有区域。",
              );
              return;
            }
            update(next);
            onDraw(undefined);
          }}
        >
          直接添加{labels[drawing]}
        </button>
      )}
      {(c.zones ?? []).map((z, i) => (
        <fieldset key={z.id} className="house-level-card">
          <legend>
            {labels[z.kind]} {i + 1}
          </legend>
          <label className="house-check">
            <input
              type="checkbox"
              checked={z.enabled}
              onChange={(e) =>
                update({
                  ...c,
                  zones: c.zones!.map((v) =>
                    v.id === z.id ? { ...v, enabled: e.target.checked } : v,
                  ),
                })
              }
            />
            启用
          </label>
          {(["left", "right", "bottom", "top"] as const).map((key) => (
            <label key={key} className="house-area-field">
              {
                { left: "左边", right: "右边", bottom: "底边", top: "顶边" }[
                  key
                ]
              }
              （m）
              <input
                type="number"
                step="0.1"
                min={key === "left" || key === "right" ? -40 : 0}
                max={40}
                value={z[key]}
                onChange={(e) => {
                  if (e.target.value === "") return;
                  const value = e.target.valueAsNumber;
                  const next = { ...z, [key]: value };
                  if (!Number.isFinite(value)) return;
                  update({
                    ...c,
                    zones: c.zones!.map((v) => (v.id === z.id ? next : v)),
                  });
                }}
              />
            </label>
          ))}
          <button
            className="button button-ghost"
            onClick={() =>
              update({ ...c, zones: c.zones!.filter((v) => v.id !== z.id) })
            }
          >
            删除区域
          </button>
        </fieldset>
      ))}
      {c.flags.foundation &&
        c.regions.map((r, i) => (
          <fieldset className="house-level-card" key={i}>
            <legend>地基 {i + 1}</legend>
            {(["left", "right"] as const).map((key) => (
              <label className="house-area-field" key={key}>
                {key === "left" ? "左边" : "右边"}（m）
                <input
                  type="number"
                  step="0.1"
                  min={-40}
                  max={40}
                  value={r[key]}
                  onChange={(e) => {
                    if (e.target.value === "") return;
                    const value = e.target.valueAsNumber;
                    if (!Number.isFinite(value)) return;
                    update({
                      ...c,
                      regions: c.regions.map((v, index) =>
                        index === i ? { ...v, [key]: value } : v,
                      ),
                    });
                  }}
                />
              </label>
            ))}
            <button
              className="button button-ghost"
              onClick={() => {
                const regions = c.regions.filter((_, index) => index !== i);
                update({
                  ...c,
                  regions,
                  flags: { ...c.flags, foundation: regions.length > 0 },
                });
              }}
            >
              删除地基
            </button>
          </fieldset>
        ))}
      <p className="house-hint">
        贴地积木须完整放在一段地基内。画布上的区域中心可拖动，方向键可微调。
      </p>
    </section>
  );
}
