import { PrefabPanel } from "./PrefabPanel";
import { selectionDesign, insertAssembly } from "./prefabs";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import {
  loadPersistentData,
  queuePersistentDataWrite,
} from "../../shared/persistent-data";
import { HouseSimulation, STEP, type SimulationSnapshot } from "./engine";
import { TaskAreasPanel } from "./TaskAreasPanel";
import type { TaskDrawKind } from "./task-layout";
import { HouseLevelsPanel } from "./HouseLevelsPanel";
import { HouseStage } from "./HouseStage";
import {
  MATERIALS,
  quakeAmplitude,
  PRESET_MATERIAL_IDS,
  MAX_PARTS,
  EXAMPLES,
  SHAPE_NAMES,
  bounds,
  connectionAnchor,
  exampleDesign,
  makePart,
  parseHouseDesign,
  partMass,
  partCost,
  placeAbove,
  placeCopy,
  placeNear,
  snapPart,
  validPlacement,
  type HousePart,
  type HouseDesign,
  type MaterialId,
  type ShapeId,
  type ExperimentSettings,
} from "./model";
import {
  DEFAULT_VIEW,
  emptyChallenge,
  generateChallenge,
  challengeActive,
  groundPlacementAllowed,
  parseWorkspace,
  migrateHouseWorkspace,
  parseHouseHistory,
  evaluateChallenge,
  initialProgress,
  advanceChallenge,
  pieceBounds,
  type HouseWorkspace,
  type HouseRecord,
  type ChallengeProgress,
} from "./challenge";
import "./house-building.css";
import { moveTaskGoal, taskCamera } from "./task-layout";

const STRENGTH_LABELS = ["很弱", "弱", "中", "强", "超强"];
const uid = () => crypto.randomUUID();
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const fmt = (v: number, d = 1) =>
  v.toLocaleString("zh-CN", { maximumFractionDigits: d });
const initial = (): HouseWorkspace => ({
  schemaVersion: 2,
  design: exampleDesign("house"),
  challenge: emptyChallenge(),
  view: { ...DEFAULT_VIEW },
});
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  logarithmic = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  logarithmic?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <label className="house-range">
      <span>
        {label}
        <b>
          {fmt(value, 2)} {unit}
        </b>
      </span>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={fmt(value, 2) + " " + unit}
        min={logarithmic ? Math.log10(min) : min}
        max={logarithmic ? Math.log10(max) : max}
        step={logarithmic ? 0.01 : step}
        value={logarithmic ? Math.log10(value) : value}
        onChange={(e) =>
          onChange(
            logarithmic
              ? Math.min(
                  max,
                  Math.max(
                    min,
                    Math.round(10 ** Number(e.target.value) / step) * step,
                  ),
                )
              : Number(e.target.value),
          )
        }
      />
    </label>
  );
}
function ShapeIcon({ shape }: { shape: ShapeId }) {
  return (
    <svg
      width="32"
      height="28"
      viewBox="0 0 32 28"
      aria-hidden="true"
      className="house-shape-icon"
    >
      {shape === "triangle" ? (
        <path d="M2 25L16 3l14 22Z" />
      ) : shape === "circle" ? (
        <circle cx="16" cy="14" r="11" />
      ) : (
        <rect
          x={shape === "block" || shape === "weight" ? 5 : 1}
          y={shape === "bar" ? 10 : shape === "rectangle" ? 6 : 3}
          width={shape === "block" || shape === "weight" ? 22 : 30}
          height={shape === "bar" ? 8 : shape === "rectangle" ? 16 : 22}
          rx="1"
        />
      )}
    </svg>
  );
}
function MaterialSelect({
  value,
  onChange,
  label,
}: {
  value: MaterialId;
  onChange: (v: MaterialId) => void;
  label: string;
}) {
  return (
    <section className="house-material-picker" aria-label={label}>
      {(["wood", "stone", "metal", "elastic"] as const).map((group) => (
        <div className="house-material-family" key={group}>
          <strong>
            {
              { wood: "木头", stone: "石头", metal: "金属", elastic: "弹性" }[
                group
              ]
            }
          </strong>
          <div className="house-material-tiers">
            {PRESET_MATERIAL_IDS.filter(
              (id) => MATERIALS[id].presetGroup === group,
            ).map((id) => {
              const m = MATERIALS[id];
              return (
                <div className="house-tier-option" key={id}>
                  <button
                    type="button"
                    className="button house-tier"
                    aria-pressed={value === id}
                    aria-label={
                      {
                        wood: "木头",
                        stone: "石头",
                        metal: "金属",
                        elastic: "弹性",
                      }[group] +
                      STRENGTH_LABELS[m.tier - 1] +
                      "，抗弯 " +
                      fmt(m.bendingStrength / 1e6) +
                      " MPa，造价 " +
                      fmt(m.pricePerKg, 3) +
                      " 点每千克"
                    }
                    aria-describedby={`material-tip-${id}`}
                    onClick={() => onChange(id)}
                  >
                    {value === id && (
                      <span className="house-tier-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                    <b>{STRENGTH_LABELS[m.tier - 1]}</b>
                  </button>
                  <span
                    className="house-material-tooltip"
                    role="tooltip"
                    id={`material-tip-${id}`}
                  >
                    {m.name} · 抗弯 {fmt(m.bendingStrength / 1e6)} MPa
                    <br />
                    造价 {fmt(m.pricePerKg, 3)} 点/kg（不扣学习币）
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {MATERIALS[value].tier === 0 && (
        <p className="house-hint">当前：{MATERIALS[value].name}</p>
      )}
    </section>
  );
}
function Composition({ record }: { record: HouseRecord }) {
  const groups = new Map<string, { count: number; mass: number }>();
  for (const p of record.workspace.design.parts) {
    const key = MATERIALS[p.material].name + " " + SHAPE_NAMES[p.shape];
    const g = groups.get(key) ?? { count: 0, mass: 0 };
    g.count++;
    g.mass += partMass(p);
    groups.set(key, g);
  }
  return (
    <ul>
      {[...groups].map(([name, g]) => (
        <li key={name}>
          {name} × {g.count} · {fmt(g.mass)} kg
        </li>
      ))}
    </ul>
  );
}
function Report({ record }: { record: HouseRecord }) {
  const { result: r, workspace: w } = record;
  return (
    <>
      <div className="house-report-grid">
        <p>
          最高到达<b>{fmt(r.maxHeight, 2)} 米</b>
        </p>
        <p>
          验收时高度<b>{fmt(r.finalHeight, 2)} 米</b>
        </p>
        <p>
          建筑总重量<b>{fmt(r.mass)} kg</b>
        </p>
        <p>
          使用组件<b>{r.componentCount} 块</b>
        </p>
        {r.cost !== undefined && (
          <p>
            建筑造价<b>{fmt(r.cost, 2)} 点</b>
          </p>
        )}
        <p>
          承受风速<b>{w.view.wind ? w.design.settings.windSpeed : 0} m/s</b>
        </p>
        <p>
          峰值风力<b>{fmt(r.windForcePeak)} N</b>
        </p>
        <p>
          地震振幅
          <b>
            {w.view.quake ? fmt(quakeAmplitude(w.design.settings) * 100, 2) : 0}{" "}
            cm
          </b>
        </p>
        <p>
          实测峰值加速度<b>{fmt(r.quakeAccelerationPeak, 2)} m/s²</b>
        </p>
      </div>
      <p>
        持续达标 10 秒 ·{" "}
        {w.view.quake
          ? "振动频率 " + w.design.settings.quakeFrequency + " Hz"
          : "未开启地震"}{" "}
        ·{" "}
        {w.view.wind
          ? (w.design.settings.windDirection === 1 ? "向右吹风" : "向左吹风") +
            (w.design.settings.gusts ? "，含阵风" : "")
          : "未开启风"}
      </p>
      <p>
        {[
          w.challenge.flags.height && "高度 ≥ " + w.challenge.height + " 米",
          w.challenge.flags.target &&
            "覆盖坐标 (" +
              w.challenge.target.x +
              ", " +
              w.challenge.target.y +
              ")",
          w.challenge.flags.foundation && "限定地基",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <Composition record={record} />
      <p className="house-hint">
        重量、受力与振动为当前二维教学模型的模拟结果。
      </p>
    </>
  );
}
export function HouseBuildingPage() {
  const [workspace, setWorkspace] = useState<HouseWorkspace>(initial);
  const current = useRef(workspace);
  current.current = workspace;
  const [loaded, setLoaded] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [saveState, setSaveState] = useState("正在读取搭建缓存…");
  const revision = useRef(0),
    dirty = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0),
    [saveAttempt, setSaveAttempt] = useState(0);
  const [taskPanel, setTaskPanel] = useState(false);
  const [levelsPanel, setLevelsPanel] = useState(false);
  const [drawingTask, setDrawingTask] = useState<TaskDrawKind>();
  const [mode, setMode] = useState<"build" | "running" | "paused">("build");
  const [selected, rawSetSelected] = useState<string>(),
    [material, setMaterial] = useState<MaterialId>("wood_t3");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const setSelected = (id: string | undefined) => {
    rawSetSelected(id);
    setSelectedIds(id ? [id] : []);
  };
  const [tool, setTool] = useState("move"),
    [connectFrom, setConnectFrom] = useState<string>(),
    [ghost, setGhost] = useState<HousePart>();
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(),
    [progress, setProgress] = useState(initialProgress);
  const progressRef = useRef<ChallengeProgress>(initialProgress());
  const sim = useRef<HouseSimulation | null>(null),
    runWorkspace = useRef<HouseWorkspace | null>(null),
    runId = useRef("");
  const [notice, setNotice] = useState(
    "点积木修改形状、材质；拖动空白处平移搭建台。",
  );
  const [undo, setUndo] = useState<HouseWorkspace[]>([]);
  const [slow, setSlow] = useState(false),
    [hidePanel, setHidePanel] = useState(false);
  const [records, setRecords] = useState<HouseRecord[]>([]),
    [historyStatus, setHistoryStatus] = useState("正在读取记录…");
  const [historyAttempt, setHistoryAttempt] = useState(0),
    [completed, setCompleted] = useState<HouseRecord>();
  const [recordLimit, setRecordLimit] = useState(20);
  const [recordStatus, setRecordStatus] = useState(""),
    [recordBusy, setRecordBusy] = useState(false);
  const pendingRecords = useRef(new Map<string, HouseRecord>());
  const [pendingCount, setPendingCount] = useState(0);
  const page = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    fullscreen = useGameFullscreen(page);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty.current || pendingRecords.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  const { design, view, challenge } = workspace;
  const building = mode === "build",
    active = challengeActive(challenge);
  const addAnchor = useRef<string | undefined>(undefined);
  const chosen = design.parts.find((p) => p.id === selected);
  const mass = design.parts.reduce((sum, p) => sum + partMass(p), 0);
  const cost = design.parts.reduce((sum, p) => sum + partCost(p), 0);
  const evaluation = snapshot
    ? evaluateChallenge(snapshot, challenge)
    : undefined;
  const change = (next: HouseWorkspace, remember = true) => {
    if (!parseWorkspace(next)) {
      setNotice("这个调整会让积木重叠、越界或连接悬空，请先移到空一点的地方。");
      return false;
    }
    const previous = current.current;
    if (remember) setUndo((h) => [...h.slice(-29), previous]);
    revision.current++;
    dirty.current = true;
    current.current = next;
    setWorkspace(next);
    setSaveState("等待缓存…");
    return true;
  };
  const changeView = (patch: Partial<HouseWorkspace["view"]>) =>
    change(
      { ...current.current, view: { ...current.current.view, ...patch } },
      false,
    );
  useEffect(() => {
    let cancelled = false;
    setLoaded("loading");
    (async () => {
      const saved = await loadPersistentData({
        stableId: "physics-house-workspace",
        parsePayload: parseWorkspace,
      });
      if (saved) return saved.payload;
      const old = await loadPersistentData({
        stableId: "physics-house",
        parsePayload: parseHouseDesign,
      });
      return old ? migrateHouseWorkspace(old.payload)! : initial();
    })()
      .then((w) => {
        if (cancelled) return;
        current.current = w;
        setWorkspace(w);
        revision.current++;
        dirty.current = true;
        setLoaded("ready");
        setSaveState("正在缓存…");
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded("error");
          setSaveState("缓存读取失败，已保护原文件。请重试读取。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);
  useEffect(() => {
    if (loaded !== "ready" || !dirty.current) return;
    const r = revision.current;
    const save = () => {
      setSaveState("正在缓存…");
      void queuePersistentDataWrite(
        "physics-house-workspace",
        workspace,
        parseWorkspace,
      )
        .then(() => {
          if (mounted.current && revision.current === r) {
            dirty.current = false;
            setSaveState("搭建、参数和视角已缓存");
          }
        })
        .catch(() => {
          if (mounted.current && revision.current === r)
            setSaveState("缓存失败，请重试；当前搭建仍在页面中。");
        });
    };
    const timer = window.setTimeout(save, 650);
    // Flush the last valid blueprint on navigation, too. Runtime debris never replaces it.
    return () => {
      window.clearTimeout(timer);
      if (!mounted.current && dirty.current) save();
    };
  }, [workspace, loaded, saveAttempt]);
  useEffect(() => {
    let cancelled = false;
    setHistoryStatus("正在读取记录…");
    void loadPersistentData({
      stableId: "physics-house-history",
      parsePayload: parseHouseHistory,
    })
      .then((saved) => {
        if (!cancelled) {
          setRecords(saved?.payload.records ?? []);
          setHistoryStatus("");
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryStatus("记录读取失败，可以重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [historyAttempt]);
  const saveRecord = async (record: HouseRecord) => {
    pendingRecords.current.set(record.id, record);
    setPendingCount(pendingRecords.current.size);
    setRecordBusy(true);
    setRecordStatus("正在保存通关记录…");
    try {
      const saved = await queuePersistentDataWrite(
        "physics-house-history",
        { schemaVersion: 1 as const, records: [record] },
        parseHouseHistory,
      );
      pendingRecords.current.delete(record.id);
      if (mounted.current) {
        setRecords(saved.payload.records);
        setRecordStatus("通关记录与完整方案已保存");
        setPendingCount(pendingRecords.current.size);
      }
    } catch {
      if (mounted.current)
        setRecordStatus("记录保存失败。方案仍在当前页面，请重试保存后再离开。");
    } finally {
      if (mounted.current) setRecordBusy(false);
    }
  };
  useEffect(() => {
    if (completed && !dialog.current?.open) dialog.current?.showModal();
  }, [completed]);
  useEffect(() => {
    if (mode !== "running" || !sim.current) return;
    let raf = 0,
      last = performance.now(),
      accumulator = 0,
      measure = 0,
      render = 0;
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      if (document.hidden || elapsed > 0.5) {
        setMode("paused");
        setNotice("离开页面时已暂停，倒计时也已暂停。");
        return;
      }
      accumulator += Math.min(elapsed, 0.1) * (slow ? 0.25 : 1);
      const engine = sim.current!;
      let finished = false;
      while (accumulator >= STEP) {
        try {
          engine.step();
        } catch {
          setMode("paused");
          setNotice("积木已离开实验范围，请回到搭建调整。原方案已保留。");
          return;
        }
        accumulator -= STEP;
        measure += STEP;
        if (challengeActive(runWorkspace.current!.challenge)) {
          progressRef.current.windForcePeak = Math.max(
            progressRef.current.windForcePeak,
            engine.windForce,
          );
          progressRef.current.quakeAccelerationPeak = Math.max(
            progressRef.current.quakeAccelerationPeak,
            Math.abs(engine.groundAcceleration),
          );
          if (measure >= 1 / 60 - 1e-8) {
            const snap = engine.snapshot(),
              ev = evaluateChallenge(snap, runWorkspace.current!.challenge);
            progressRef.current = advanceChallenge(
              progressRef.current,
              ev,
              measure,
              engine.windForce,
              engine.groundAcceleration,
            );
            measure = 0;
            if (progressRef.current.done) {
              const w = runWorkspace.current!,
                p = progressRef.current;
              const record: HouseRecord = {
                id: runId.current,
                createdAt: new Date().toISOString(),
                modelVersion: 3,
                workspace: structuredClone(w),
                result: {
                  duration: 10,
                  maxHeight: p.maxHeight,
                  finalHeight: ev.height,
                  mass: w.design.parts.reduce((n, b) => n + partMass(b), 0),
                  componentCount: w.design.parts.length,
                  cost: w.design.parts.reduce((n, b) => n + partCost(b), 0),
                  windForcePeak: p.windForcePeak,
                  quakeAccelerationPeak: p.quakeAccelerationPeak,
                },
              };
              setSnapshot(snap);
              setProgress({ ...p });
              setMode("paused");
              setCompleted(record);
              void saveRecord(record);
              finished = true;
              break;
            }
          }
        }
      }
      if (finished) return;
      if (now - render > 32) {
        setSnapshot(engine.snapshot());
        setProgress({ ...progressRef.current });
        render = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, slow]);
  const returnToBuild = () => {
    setMode("build");
    sim.current = null;
    setSnapshot(undefined);
    setProgress(initialProgress());
    progressRef.current = initialProgress();
    setGhost(undefined);
  };
  const start = () => {
    setTaskPanel(false);
    setLevelsPanel(false);
    setDrawingTask(undefined);
    if (!design.parts.length) {
      setNotice("先放一块积木，再开始运行。");
      return;
    }
    if (!groundPlacementAllowed(design, challenge)) {
      setNotice(
        "贴地积木必须完整放在一段亮色地基内；请加宽地基、缩短积木或调整位置。",
      );
      return;
    }
    if (!parseHouseDesign(design)) {
      setNotice(
        "方案中有积木重叠，请移动重叠积木使边缘贴合后再运行。原方案已保留。",
      );
      return;
    }
    const engine = new HouseSimulation(design, {
      regions: challenge.flags.foundation ? challenge.regions : undefined,
      warmup: active ? 0 : 1.5,
    });
    engine.wind = view.wind;
    engine.quake = view.quake;
    sim.current = engine;
    runWorkspace.current = structuredClone(workspace);
    runId.current = uid();
    progressRef.current = initialProgress();
    setProgress(initialProgress());
    setSnapshot(engine.snapshot());
    setCompleted(undefined);
    setMode("running");
    setTool("move");
    setConnectFrom(undefined);
    setNotice(
      active
        ? "挑战开始！让所有勾选条件连续保持 10 秒。"
        : "观察风、地震、压力与倾倒。返回搭建可恢复原方案。",
    );
  };
  const refreshRunParameters = () => {
    if (!sim.current || !runWorkspace.current || progressRef.current.done)
      return;
    runWorkspace.current.design.settings = {
      ...current.current.design.settings,
    };
    runWorkspace.current.view = { ...current.current.view };
    if (active) {
      progressRef.current = initialProgress();
      setProgress(initialProgress());
      setNotice("参数已调整，按新条件重新保持 10 秒。");
    }
  };
  const setting = (patch: Partial<ExperimentSettings>) => {
    const next = {
      ...current.current,
      design: {
        ...current.current.design,
        settings: { ...current.current.design.settings, ...patch },
      },
    };
    if (change(next, false) && sim.current) {
      Object.assign(sim.current.settings, patch);
      refreshRunParameters();
    }
  };
  const toggleForce = (key: "wind" | "quake", value: boolean) => {
    changeView({ [key]: value });
    if (sim.current) sim.current[key] = value;
    refreshRunParameters();
  };
  const updatePart = (part: HousePart) => {
    const old = design.parts.find((p) => p.id === part.id);
    if (!old) return;
    const geometryChanged = [
      "shape",
      "x",
      "y",
      "width",
      "height",
      "angle",
    ].some((k) => old[k as keyof HousePart] !== part[k as keyof HousePart]);
    const next = {
      ...design,
      parts: design.parts.map((p) => (p.id === part.id ? part : p)),
      connections: geometryChanged
        ? design.connections.filter((c) => c.a !== part.id && c.b !== part.id)
        : design.connections,
    };
    if (!validPlacement(part, design.parts)) {
      setNotice("这里放不下：请先移开旁边的积木，或调整位置。");
      return;
    }
    if (!groundPlacementAllowed({ ...next, parts: [part] }, challenge)) {
      setNotice("贴地积木不能比地基宽，请加宽地基、缩短积木或调整位置。");
      return;
    }
    if (change({ ...workspace, design: next }))
      setNotice(
        geometryChanged
          ? "已调整积木；原有连接已解除，请按新位置重新连接。"
          : "已更新材质和物理属性。",
      );
  };
  const add = (shape: ShapeId) => {
    if (design.parts.length >= MAX_PARTS) {
      setNotice("搭建台最多放 160 块积木。");
      return;
    }
    const cx = challenge.flags.foundation
      ? (challenge.regions[0].left + challenge.regions[0].right) / 2
      : view.x;
    const reference =
      chosen ??
      design.parts.find((p) => p.id === addAnchor.current) ??
      design.parts.at(-1);
    const created = makePart(
      uid(),
      shape,
      material,
      cx,
      Math.max(0.4, view.y - view.span * 0.22),
    );
    const p = reference
      ? placeAbove(created, reference, design.parts)
      : placeNear(
          { ...created, y: created.y - bounds(created).bottom },
          design.parts,
        );
    if (!p) {
      setNotice(
        reference
          ? "这条竖线已没有足够空间，请选另一块积木作为起点。"
          : "附近空间不足，拖动画布到空白处再放一块。",
      );
      return;
    }
    if (!groundPlacementAllowed({ ...design, parts: [p] }, challenge)) {
      setNotice("请把视角移到地基上方再添加积木。");
      return;
    }
    if (
      change({
        ...workspace,
        design: { ...design, parts: [...design.parts, p] },
      })
    ) {
      addAnchor.current = p.id;
      setSelected(undefined);
      setTool("move");
      setNotice(
        reference
          ? "新积木已紧贴在正上方，继续添加就能一块块往上搭。"
          : "已放入第一块积木，继续添加会紧贴在它的正上方。",
      );
    }
  };
  const insertPrefab = (source: HouseDesign, anchor = chosen) => {
    if (!building || loaded !== "ready") return;
    const result = insertAssembly(source, design, challenge, anchor, view.x);
    if (!result) {
      setNotice(
        "没有足够的合法空间放入整组积木，请腾出空间或调整地基（最多 160 块）。",
      );
      return;
    }
    if (change({ ...workspace, design: result.design })) {
      setSelectedIds(result.ids);
      rawSetSelected(result.ids.at(-1));
      addAnchor.current = result.ids.at(-1);
      setTool("move");
      setConnectFrom(undefined);
      changeView({
        ...result.center,
        span: Math.min(
          84,
          Math.max(view.span, result.width + 3, (result.height + 3) / 0.6),
        ),
      });
      setNotice(
        "已放入 " + result.ids.length + " 块，保持原有排列；每块仍可单独拖动。",
      );
    }
  };
  const copySelected = () => {
    if (selectedIds.length > 1) {
      const source = selectionDesign(design, selectedIds);
      const parts = design.parts.filter((p) => selectedIds.includes(p.id)),
        bs = parts.map(bounds);
      if (!source || !chosen) return;
      const left = Math.min(...bs.map((b) => b.left)),
        right = Math.max(...bs.map((b) => b.right)),
        bottom = Math.min(...bs.map((b) => b.bottom)),
        top = Math.max(...bs.map((b) => b.top));
      insertPrefab(source, {
        ...chosen,
        shape: "rectangle",
        x: (left + right) / 2,
        y: (bottom + top) / 2,
        width: right - left,
        height: top - bottom,
      });
      return;
    }
    if (!chosen) return;
    if (design.parts.length >= MAX_PARTS) {
      setNotice("搭建台最多放 160 块积木。");
      return;
    }
    const p = placeCopy(
      { ...chosen, id: uid() },
      chosen,
      design.parts,
      (candidate) =>
        groundPlacementAllowed({ ...design, parts: [candidate] }, challenge),
    );
    if (!p) {
      setNotice("搭建台里没有足够的空位，请移走一些积木或缩小尺寸后再复制。");
      return;
    }
    if (
      change({
        ...workspace,
        design: { ...design, parts: [...design.parts, p] },
      })
    ) {
      addAnchor.current = p.id;
      setSelected(p.id);
      setTool("move");
      setConnectFrom(undefined);
      setNotice("已复制相同形状、材质和尺寸，放到可操作的空位。");
      const b = bounds(p);
      if (
        b.left < view.x - view.span / 2 ||
        b.right > view.x + view.span / 2 ||
        b.bottom < view.y - view.span * 0.3 ||
        b.top > view.y + view.span * 0.3
      )
        changeView({
          x: Math.max(-40, Math.min(40, p.x)),
          y: Math.max(-2, Math.min(40, p.y)),
          span: Math.min(
            84,
            Math.max(
              view.span,
              b.right - b.left + 2,
              (b.top - b.bottom + 2) / 0.6,
            ),
          ),
        });
    }
  };
  useEffect(() => {
    const handleCopyShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.metaKey ||
        event.key.toLowerCase() !== "v" ||
        event.isComposing ||
        !building ||
        loaded !== "ready" ||
        !chosen ||
        taskPanel ||
        levelsPanel
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest("input, textarea, select, [role='textbox']") ||
          (target instanceof HTMLElement && target.isContentEditable))
      )
        return;
      event.preventDefault();
      if (!event.repeat) copySelected();
    };
    document.addEventListener("keydown", handleCopyShortcut);
    return () => document.removeEventListener("keydown", handleCopyShortcut);
  });
  const remove = () => {
    if (!chosen) return;
    change({
      ...workspace,
      design: {
        ...design,
        parts: design.parts.filter((p) => p.id !== chosen.id),
        connections: design.connections.filter(
          (c) => c.a !== chosen.id && c.b !== chosen.id,
        ),
      },
    });
    setSelected(undefined);
  };
  const select = (id: string, additive = false) => {
    if (building && additive) {
      const ids = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      setSelectedIds(ids);
      rawSetSelected(ids.at(-1));
      addAnchor.current = id;
      return;
    }
    setTaskPanel(false);
    setLevelsPanel(false);
    setDrawingTask(undefined);
    addAnchor.current = id;
    setSelected(id);
    if (!building || !["fixed", "hinge"].includes(tool)) return;
    if (!connectFrom) {
      setConnectFrom(id);
      setNotice("再点紧挨着的另一块积木，完成连接。");
      return;
    }
    if (connectFrom === id) return;
    const a = design.parts.find((p) => p.id === connectFrom)!,
      b = design.parts.find((p) => p.id === id)!;
    const anchor = connectionAnchor(a, b);
    if (!anchor) {
      setNotice("两块积木要先靠在一起，才能连接。");
      setConnectFrom(id);
      return;
    }
    const next = {
      ...design,
      connections: [
        ...design.connections.filter(
          (c) =>
            !((c.a === a.id && c.b === b.id) || (c.b === a.id && c.a === b.id)),
        ),
        {
          id: uid(),
          a: a.id,
          b: b.id,
          kind: tool as "fixed" | "hinge",
          anchor,
          strength: design.settings.connectionStrength,
        },
      ],
    };
    if (change({ ...workspace, design: next }))
      setNotice("连接完成。固定连接保持夹角，铰链可以转动。");
    setConnectFrom(undefined);
  };
  const anchor = () => {
    if (!chosen) return;
    const b = bounds(chosen);
    if (b.bottom > 0.12) {
      setNotice("先把这块积木放在地基上，再固定到底座。");
      return;
    }
    change({
      ...workspace,
      design: {
        ...design,
        connections: [
          ...design.connections.filter(
            (c) => !(c.a === chosen.id && c.b === "ground"),
          ),
          {
            id: uid(),
            a: chosen.id,
            b: "ground",
            kind: "fixed",
            anchor: { x: chosen.x, y: 0 },
            strength: design.settings.connectionStrength,
          },
        ],
      },
    });
  };
  const fit = () => {
    const bs = design.parts.map(bounds);
    const left = Math.min(
      -3,
      ...bs.map((b) => b.left),
      ...(challenge.flags.foundation
        ? challenge.regions.map((r) => r.left)
        : []),
    );
    const right = Math.max(
      3,
      ...bs.map((b) => b.right),
      ...(challenge.flags.foundation
        ? challenge.regions.map((r) => r.right)
        : []),
    );
    const top = Math.max(
      5,
      ...bs.map((b) => b.top),
      challenge.flags.height ? challenge.height : 0,
      challenge.flags.target ? challenge.target.y : 0,
    );
    changeView({
      x: (left + right) / 2,
      y: top / 2,
      span: Math.min(84, Math.max(12, right - left + 3, (top + 3) / 0.6)),
    });
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!building || !chosen) return;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-0.1, 0],
      ArrowRight: [0.1, 0],
      ArrowUp: [0, 0.1],
      ArrowDown: [0, -0.1],
    };
    if (deltas[e.key]) {
      e.preventDefault();
      const [x, y] = deltas[e.key];
      updatePart({ ...chosen, x: chosen.x + x, y: chosen.y + y });
    } else if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      updatePart({
        ...chosen,
        angle:
          chosen.angle + Math.PI / 12 > Math.PI
            ? chosen.angle + Math.PI / 12 - 2 * Math.PI
            : chosen.angle + Math.PI / 12,
      });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove();
    }
  };
  const changeShape = (shape: ShapeId) => {
    if (!chosen) return;
    const defaults = makePart(
      chosen.id,
      shape,
      chosen.material,
      chosen.x,
      chosen.y,
    );
    const next = {
      ...chosen,
      shape,
      width: defaults.width,
      height: defaults.height,
    };
    next.y += bounds(chosen).bottom - bounds(next).bottom;
    updatePart(next);
  };
  const restore = (record: HouseRecord) => {
    returnToBuild();
    change(structuredClone(record.workspace));
    setSelected(undefined);
    setNotice("已加载该次任务的原始布局、材质、风震参数与目标，可以继续编辑。");
  };
  const closeReport = () => {
    dialog.current?.close();
    setCompleted(undefined);
  };
  return (
    <div
      ref={page}
      className={"house-page" + (fullscreen.focused ? " house-fullscreen" : "")}
    >
      <GameTopBar
        title="盖房子"
        backHref="/?tab=physics"
        backLabel="物理大厅"
        wallets={false}
        controls={
          <>
            <span className="house-mode">
              {building
                ? "搭建中"
                : mode === "paused"
                  ? "已暂停"
                  : "实验进行中"}
            </span>
            <button
              className="button button-ghost"
              data-fullscreen-exit={fullscreen.focused || undefined}
              disabled={fullscreen.switching}
              onClick={() =>
                void (fullscreen.focused
                  ? fullscreen.leave()
                  : fullscreen.enter())
              }
            >
              {fullscreen.focused ? "退出全屏" : "全屏搭建"}
            </button>
          </>
        }
      />
      <div className="house-toolbar">
        <button
          className="button button-secondary"
          disabled={!building || loaded !== "ready"}
          aria-pressed={tool === "select"}
          onClick={() => {
            setTool(tool === "select" ? "move" : "select");
            setTaskPanel(false);
            setLevelsPanel(false);
            setDrawingTask(undefined);
            setHidePanel(false);
            setNotice(
              "多选：拖动空白处框选，或点选积木增减选择；也可 Shift 点选。",
            );
          }}
        >
          {tool === "select" ? "结束多选" : "多选"}
        </button>
        <button
          className="button button-secondary"
          disabled={loaded !== "ready"}
          aria-pressed={levelsPanel}
          onClick={() => {
            setLevelsPanel(!levelsPanel);
            setTaskPanel(false);
            setDrawingTask(undefined);
            setHidePanel(false);
          }}
        >
          {levelsPanel ? "返回搭建" : "关卡"}
        </button>
        <button
          className="button button-secondary"
          disabled={!building || loaded !== "ready"}
          aria-pressed={taskPanel}
          onClick={() => {
            setLevelsPanel(false);
            if (!taskPanel) {
              changeView(taskCamera(challenge));
              setHidePanel(false);
            }
            setTaskPanel(!taskPanel);
            setDrawingTask(undefined);
            setSelected(undefined);
            setTool("move");
            setConnectFrom(undefined);
          }}
        >
          {taskPanel ? "返回搭建" : "配置任务"}
        </button>
        {building ? (
          <button
            className="button button-primary"
            disabled={loaded !== "ready" || !design.parts.length}
            onClick={start}
          >
            {active ? "开始挑战" : "开始运行"}
          </button>
        ) : (
          <>
            <button
              className="button button-primary"
              disabled={progress.done}
              onClick={() => setMode(mode === "running" ? "paused" : "running")}
            >
              {mode === "running" ? "暂停" : "继续运行"}
            </button>
            <button className="button button-secondary" onClick={returnToBuild}>
              回到搭建
            </button>
          </>
        )}

        <button
          className="button button-ghost"
          disabled={!building || !undo.length || loaded !== "ready"}
          onClick={() => {
            const last = undo.at(-1);
            if (last) {
              change(last, false);
              setUndo((h) => h.slice(0, -1));
              setSelected(undefined);
            }
          }}
        >
          撤销
        </button>
        <button
          className="button button-ghost"
          disabled={!building || loaded !== "ready" || !design.parts.length}
          onClick={() => {
            change({
              ...workspace,
              design: { ...design, parts: [], connections: [] },
            });
            setSelected(undefined);
            setNotice("搭建台已清空，可以撤销。通关记录仍然保留。");
          }}
        >
          清空搭建台
        </button>
        <label className="house-check">
          <input
            type="checkbox"
            checked={view.showMass}
            onChange={(e) => changeView({ showMass: e.target.checked })}
          />
          显示每块重量
        </label>
        <label className="house-check">
          <input
            type="checkbox"
            checked={view.showCenter}
            onChange={(e) => changeView({ showCenter: e.target.checked })}
          />
          显示重心
        </label>
        <button
          className="button button-ghost"
          onClick={() => setHidePanel((v) => !v)}
        >
          {hidePanel ? "展开工具" : "收起工具"}
        </button>
      </div>
      <div className={"house-layout" + (hidePanel ? " is-wide" : "")}>
        <main className="house-board">
          <div className="house-viewbar">
            <button
              className="button button-ghost"
              disabled={view.span <= 6}
              onClick={() => changeView({ span: Math.max(6, view.span / 1.3) })}
              aria-label="放大搭建台"
            >
              ＋ 放大
            </button>
            <button
              className="button button-ghost"
              disabled={view.span >= 84}
              onClick={() =>
                changeView({ span: Math.min(84, view.span * 1.3) })
              }
              aria-label="缩小搭建台"
            >
              － 缩小
            </button>
            <button className="button button-ghost" onClick={fit}>
              看全建筑
            </button>
            <span>
              {design.parts.length} / {MAX_PARTS} 块 · {fmt(mass)} kg ·{" "}
              {fmt(cost, 2)} 造价点
            </span>
          </div>
          <div className="house-canvas-wrap">
            <HouseStage
              workspace={workspace}
              snapshot={snapshot}
              selected={selected}
              selectedIds={selectedIds}
              onSelection={(ids) => {
                setSelectedIds(ids);
                rawSetSelected(ids.at(-1));
              }}
              ghost={ghost}
              tool={loaded === "ready" ? tool : "pan"}
              onSelect={select}
              editingTask={building && taskPanel}
              drawTask={drawingTask}
              onTaskDrawn={(success) => {
                setDrawingTask(undefined);
                setNotice(
                  success
                    ? "已添加任务区域，可以拖动中心或在面板调整边界。"
                    : "未能添加：地基不能重叠，最多 12 段地基和 24 个区域。",
                );
              }}
              onTaskChange={(c) =>
                change({ ...current.current, challenge: c }, false)
              }
              onDeselect={() => {
                setSelected(undefined);
                setConnectFrom(undefined);
                setTool("move");
              }}
              onMove={(p, commit) => {
                if (!building || loaded !== "ready") return;
                if (commit) {
                  setGhost(undefined);
                  const old = design.parts.find((x) => x.id === p.id);
                  if (old && (p.x !== old.x || p.y !== old.y))
                    updatePart(snapPart(p, design.parts));
                } else setGhost(snapPart(p, design.parts));
              }}
              onView={changeView}
              onKey={key}
            />
            {!design.parts.length && !taskPanel && (
              <div className="house-empty">
                从工具面板添加第一块积木
                <br />
                <small>80 × 40 米，尽情搭建</small>
              </div>
            )}
            {active && !taskPanel && (
              <div
                className={
                  "house-countdown" + (progress.done ? " is-success" : "")
                }
                role="timer"
                aria-label={
                  "达标倒计时 " + Math.ceil(10 - progress.held) + " 秒"
                }
              >
                <strong>
                  {progress.done
                    ? "挑战完成"
                    : building
                      ? "坚持 10 秒"
                      : Math.ceil(10 - progress.held) + " 秒"}
                </strong>
                <span>
                  {progress.done
                    ? "恭喜你，建筑通过验收！"
                    : building
                      ? "准备好后，开始挑战"
                      : mode === "paused"
                        ? "已暂停，倒计时暂停"
                        : evaluation?.ok
                          ? "所有条件已达成，保持住！"
                          : (evaluation?.reasons[0] ?? "正在检测")}
                </span>
                <progress max="10" value={progress.held} />
              </div>
            )}
          </div>
          <div className="house-observations">
            <span>
              高度{" "}
              <b>
                {fmt(
                  snapshot
                    ? Math.max(
                        0,
                        ...snapshot.pieces
                          .filter((p) => p.supported)
                          .map((p) => pieceBounds(p).top - snapshot.ground.y),
                      )
                    : Math.max(0, ...design.parts.map((p) => bounds(p).top)),
                  2,
                )}{" "}
                m
              </b>
            </span>
            <span>
              地基受力 <b>{fmt((snapshot?.groundLoad ?? 0) / 1000)} kN</b>
            </span>
            <span>
              风力 <b>{fmt(snapshot?.windForce ?? 0)} N</b>
            </span>
            <label className="house-check">
              <input
                type="checkbox"
                checked={slow}
                onChange={(e) => setSlow(e.target.checked)}
              />
              慢动作 ×¼
            </label>
          </div>
          <p className="house-notice" role="status">
            {notice}
          </p>
          {snapshot?.events.length ? (
            <p className="house-events">{snapshot.events.at(-1)}</p>
          ) : null}
          <div className="house-save">
            <span>{saveState}</span>
            {loaded === "error" ? (
              <button
                className="button button-ghost"
                onClick={() => setLoadAttempt((n) => n + 1)}
              >
                重试读取
              </button>
            ) : saveState.includes("失败") ? (
              <button
                className="button button-ghost"
                onClick={() => setSaveAttempt((n) => n + 1)}
              >
                重试缓存
              </button>
            ) : null}
          </div>
        </main>
        {!hidePanel && (
          <aside className="house-panel" aria-label="搭建工具与任务">
            {levelsPanel ? (
              <HouseLevelsPanel
                workspace={workspace}
                onLoad={(saved, name) => {
                  returnToBuild();
                  change(saved);
                  setSelected(undefined);
                  addAnchor.current = undefined;
                  setTaskPanel(false);
                  setLevelsPanel(false);
                  setTool("move");
                  setConnectFrom(undefined);
                  setNotice(`已载入「${name}」，可以继续搭建或开始运行。`);
                }}
              />
            ) : (
              <>
                {building && taskPanel && (
                  <section className="house-task-panel">
                    <h2>配置任务</h2>
                    <TaskAreasPanel
                      challenge={challenge}
                      onChange={(c) => change({ ...workspace, challenge: c })}
                      drawing={drawingTask}
                      onDraw={setDrawingTask}
                    />
                    <button
                      className="button button-primary"
                      onClick={() => {
                        const nextSeed = seed(),
                          c = generateChallenge(
                            Object.values(challenge.flags).some(Boolean)
                              ? challenge.flags
                              : {
                                  height: true,
                                  target: true,
                                  foundation: true,
                                },
                            nextSeed,
                          );
                        change({
                          ...workspace,
                          challenge: c,
                          view: {
                            ...view,
                            ...taskCamera(c),
                            wind: true,
                            quake: true,
                          },
                          design: {
                            ...design,
                            settings: {
                              ...design.settings,
                              windSpeed: 10 + (nextSeed % 26),
                              quakeAcceleration:
                                Math.round((1 + (nextSeed % 21) / 5) * 5) / 5,
                              quakeAmplitude: (1 + (nextSeed % 6)) / 100,
                            },
                          },
                        });
                      }}
                    >
                      随机任务
                    </button>
                    <p className="house-hint">
                      随机任务会重新生成条件。也可以手动添加区域，拖动位置或修改边界。
                    </p>
                    {(["height", "target", "foundation"] as const).map((k) => (
                      <label className="house-check" key={k}>
                        <input
                          type="checkbox"
                          checked={challenge.flags[k]}
                          onChange={(e) =>
                            change({
                              ...workspace,
                              challenge: {
                                ...challenge,
                                layoutVersion: challenge.layoutVersion ?? 2,
                                regions:
                                  k === "foundation" &&
                                  e.target.checked &&
                                  !challenge.regions.length
                                    ? [{ left: -2.5, right: 2.5 }]
                                    : challenge.regions,
                                flags: {
                                  ...challenge.flags,
                                  [k]: e.target.checked,
                                },
                              },
                            })
                          }
                        />
                        {
                          {
                            height: "达到指定高度",
                            target: "碰触目标点",
                            foundation: "限定地基",
                          }[k]
                        }
                      </label>
                    ))}
                    {challenge.flags.height && (
                      <Range
                        label="任务高度"
                        value={challenge.height}
                        min={0.5}
                        max={40}
                        step={0.1}
                        unit="m"
                        onChange={(v) =>
                          change({
                            ...workspace,
                            challenge: moveTaskGoal(challenge, "height", {
                              x: 0,
                              y: v,
                            }),
                          })
                        }
                      />
                    )}
                    {challenge.flags.target && (
                      <>
                        <Range
                          label="目标点横坐标"
                          value={challenge.target.x}
                          min={-40}
                          max={40}
                          step={0.1}
                          unit="m"
                          onChange={(v) =>
                            change({
                              ...workspace,
                              challenge: moveTaskGoal(challenge, "target", {
                                ...challenge.target,
                                x: v,
                              }),
                            })
                          }
                        />
                        <Range
                          label="目标点高度"
                          value={challenge.target.y}
                          min={0.1}
                          max={40}
                          step={0.1}
                          unit="m"
                          onChange={(v) =>
                            change({
                              ...workspace,
                              challenge: moveTaskGoal(challenge, "target", {
                                ...challenge.target,
                                y: v,
                              }),
                            })
                          }
                        />
                      </>
                    )}
                    <label className="house-check">
                      <input
                        type="checkbox"
                        checked={view.wind}
                        onChange={(e) => toggleForce("wind", e.target.checked)}
                      />
                      开启风
                    </label>
                    <Range
                      label="任务风速"
                      value={design.settings.windSpeed}
                      min={0}
                      max={60}
                      unit="m/s"
                      onChange={(v) => setting({ windSpeed: v })}
                    />
                    <button
                      className="button button-ghost"
                      onClick={() =>
                        setting({
                          windDirection:
                            design.settings.windDirection === 1 ? -1 : 1,
                        })
                      }
                    >
                      风向{" "}
                      {design.settings.windDirection === 1
                        ? "向右 →"
                        : "← 向左"}
                    </button>
                    <label className="house-check">
                      <input
                        type="checkbox"
                        checked={view.quake}
                        onChange={(e) => toggleForce("quake", e.target.checked)}
                      />
                      开启地震
                    </label>
                    <Range
                      label="任务振幅"
                      value={quakeAmplitude(design.settings) * 100}
                      min={0}
                      max={Math.max(
                        50,
                        Math.ceil(quakeAmplitude(design.settings) * 100),
                      )}
                      step={0.1}
                      unit="cm"
                      onChange={(v) => setting({ quakeAmplitude: v / 100 })}
                    />
                    <Range
                      label="振动频率"
                      value={design.settings.quakeFrequency}
                      min={0.5}
                      max={4}
                      step={0.1}
                      unit="Hz"
                      onChange={(v) =>
                        setting({
                          quakeFrequency: v,
                          quakeAmplitude: quakeAmplitude(design.settings),
                        })
                      }
                    />
                  </section>
                )}

                {!building && (
                  <section className="house-running-panel">
                    <h2>运行调节</h2>{" "}
                    <fieldset
                      className="house-live-controls"
                      disabled={loaded !== "ready" || progress.done}
                    >
                      <div className="house-live-force">
                        <div className="house-live-heading">
                          <label>
                            <input
                              type="checkbox"
                              aria-label="开启风"
                              checked={view.wind}
                              onChange={(e) =>
                                toggleForce("wind", e.target.checked)
                              }
                            />
                            风力
                          </label>
                          <button
                            className="button button-ghost"
                            aria-label="切换风向"
                            onClick={() =>
                              setting({
                                windDirection:
                                  design.settings.windDirection === 1 ? -1 : 1,
                              })
                            }
                          >
                            {design.settings.windDirection === 1
                              ? "向右 →"
                              : "← 向左"}
                          </button>
                        </div>
                        <Range
                          label="风速"
                          value={design.settings.windSpeed}
                          min={0}
                          max={60}
                          unit="m/s"
                          onChange={(v) => setting({ windSpeed: v })}
                        />
                      </div>
                      <div className="house-live-force">
                        <div className="house-live-heading">
                          <label>
                            <input
                              type="checkbox"
                              aria-label="开启地震"
                              checked={view.quake}
                              onChange={(e) =>
                                toggleForce("quake", e.target.checked)
                              }
                            />
                            震动
                          </label>
                          <details className="house-force-options">
                            <summary aria-label="阵风设置">设置</summary>
                            <div>
                              <label className="house-check">
                                <input
                                  type="checkbox"
                                  checked={design.settings.gusts}
                                  onChange={(e) =>
                                    setting({ gusts: e.target.checked })
                                  }
                                />
                                阵风
                              </label>
                            </div>
                          </details>
                        </div>
                        <Range
                          label="振幅"
                          value={quakeAmplitude(design.settings) * 100}
                          min={0}
                          max={Math.max(
                            50,
                            Math.ceil(quakeAmplitude(design.settings) * 100),
                          )}
                          step={0.1}
                          unit="cm"
                          onChange={(v) => setting({ quakeAmplitude: v / 100 })}
                        />
                        <Range
                          label="振动频率"
                          value={design.settings.quakeFrequency}
                          min={0.5}
                          max={4}
                          step={0.1}
                          unit="Hz"
                          onChange={(v) =>
                            setting({
                              quakeFrequency: v,
                              quakeAmplitude: quakeAmplitude(design.settings),
                            })
                          }
                        />
                      </div>
                    </fieldset>
                    <p className="house-hint">
                      勾选开启，拖动调整。
                      {active ? "调整后重新保持 10 秒。" : ""}
                    </p>
                  </section>
                )}
                {building && !taskPanel && (
                  <>
                    <details className="house-section">
                      <summary>组合预制件</summary>
                      <fieldset
                        className="house-controls"
                        disabled={loaded !== "ready"}
                      >
                        <PrefabPanel
                          selection={selectionDesign(design, selectedIds)}
                          material={material}
                          onInsert={insertPrefab}
                        />
                      </fieldset>
                    </details>
                    {selectedIds.length > 1 && (
                      <p className="house-hint">
                        已选 {selectedIds.length}{" "}
                        块。复制将保留整组排列；下方属性只修改最后点选的积木。
                      </p>
                    )}
                    <fieldset
                      disabled={!building || loaded !== "ready"}
                      className="house-controls"
                    >
                      <div className="house-panel-heading">
                        <h2>
                          {selectedIds.length > 1
                            ? "选中 " + selectedIds.length + " 块"
                            : chosen
                              ? "选中积木"
                              : "添加积木"}
                        </h2>
                        {chosen && (
                          <button
                            className="button button-secondary"
                            onClick={copySelected}
                            title="复制选中的积木（Ctrl + V）"
                            aria-keyshortcuts="Control+V"
                          >
                            {selectedIds.length > 1 ? "复制整组" : "复制"}
                          </button>
                        )}
                        {chosen && (
                          <button
                            className="button button-ghost"
                            onClick={() => {
                              addAnchor.current = chosen.id;
                              setSelected(undefined);
                              setTool("move");
                              setConnectFrom(undefined);
                            }}
                          >
                            ＋ 添加积木
                          </button>
                        )}
                      </div>
                      <MaterialSelect
                        value={chosen?.material ?? material}
                        label={
                          chosen
                            ? "选中积木的材质（也用于新积木）"
                            : "新积木材质"
                        }
                        onChange={(v) => {
                          setMaterial(v);
                          if (chosen) updatePart({ ...chosen, material: v });
                        }}
                      />
                      {!chosen && (
                        <div className="house-shapes">
                          {(Object.keys(SHAPE_NAMES) as ShapeId[]).map(
                            (shape) => (
                              <button
                                className="button button-secondary"
                                key={shape}
                                onClick={() => add(shape)}
                              >
                                <ShapeIcon shape={shape} />＋{" "}
                                {shape === "bar" ? "木板" : SHAPE_NAMES[shape]}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                      {chosen && (
                        <div className="house-tools house-edit-tools">
                          {[
                            ["move", "移动"],
                            ["pan", "平移"],
                            ["fixed", "固定连接"],
                            ["hinge", "铰链连接"],
                          ].map(([id, name]) => (
                            <button
                              key={id}
                              className="button button-ghost"
                              aria-pressed={tool === id}
                              onClick={() => {
                                setTool(id);
                                setConnectFrom(undefined);
                                setNotice(
                                  id === "fixed" || id === "hinge"
                                    ? "依次点选两块相邻的积木。"
                                    : "拖动积木调整位置；拖动空白处移动视角。",
                                );
                              }}
                            >
                              {id === "bar" ? "木板" : name}
                            </button>
                          ))}
                        </div>
                      )}
                      <section className="house-inspector">
                        {chosen ? (
                          <>
                            <div className="house-replace-frame">
                              <h3>更换形状</h3>
                              <div
                                className="house-shapes house-replace-shapes"
                                role="group"
                                aria-label="这块积木的形状"
                              >
                                {Object.entries(SHAPE_NAMES).map(
                                  ([id, name]) => (
                                    <button
                                      className="button button-ghost"
                                      key={id}
                                      aria-pressed={chosen.shape === id}
                                      onClick={() => changeShape(id as ShapeId)}
                                    >
                                      <ShapeIcon shape={id as ShapeId} />
                                      {name}
                                    </button>
                                  ),
                                )}
                              </div>
                            </div>
                            <p className="house-material-facts">
                              <b>{fmt(partMass(chosen))} kg</b> ·{" "}
                              {fmt(partCost(chosen), 2)} 造价点 ·{" "}
                              {MATERIALS[chosen.material].grade}
                              <br />
                              抗压{" "}
                              {fmt(
                                MATERIALS[chosen.material].compressiveStrength /
                                  1e6,
                              )}{" "}
                              MPa · 抗弯{" "}
                              {fmt(
                                MATERIALS[chosen.material].bendingStrength /
                                  1e6,
                              )}{" "}
                              MPa
                              <br />
                              密度 {MATERIALS[chosen.material].density} kg/m³
                            </p>
                            <Range
                              label={
                                ["bar", "rectangle", "triangle"].includes(
                                  chosen.shape,
                                )
                                  ? "长度 / 底边"
                                  : "大小"
                              }
                              value={chosen.width}
                              min={
                                chosen.shape === "bar"
                                  ? Math.max(0.4, chosen.height * 2)
                                  : 0.4
                              }
                              max={
                                ["bar", "rectangle", "triangle"].includes(
                                  chosen.shape,
                                )
                                  ? 10
                                  : 6
                              }
                              step={0.1}
                              unit="m"
                              onChange={(v) => {
                                const p = {
                                  ...chosen,
                                  width: v,
                                  height: [
                                    "bar",
                                    "rectangle",
                                    "triangle",
                                  ].includes(chosen.shape)
                                    ? chosen.height
                                    : v,
                                };
                                p.y += bounds(chosen).bottom - bounds(p).bottom;
                                updatePart(p);
                              }}
                            />
                            {["bar", "rectangle", "triangle"].includes(
                              chosen.shape,
                            ) && (
                              <Range
                                label={chosen.shape === "bar" ? "厚度" : "高度"}
                                value={chosen.height}
                                min={chosen.shape === "bar" ? 0.05 : 0.2}
                                max={
                                  chosen.shape === "bar"
                                    ? Math.min(3, chosen.width / 2)
                                    : 6
                                }
                                step={0.05}
                                unit="m"
                                onChange={(v) => {
                                  const p = { ...chosen, height: v };
                                  p.y +=
                                    bounds(chosen).bottom - bounds(p).bottom;
                                  updatePart(p);
                                }}
                              />
                            )}
                            <Range
                              label="旋转"
                              value={(chosen.angle * 180) / Math.PI}
                              min={-180}
                              max={180}
                              step={5}
                              unit="°"
                              onChange={(v) => {
                                const p = {
                                  ...chosen,
                                  angle: (v * Math.PI) / 180,
                                };
                                p.y = Math.max(p.y, p.y - bounds(p).bottom);
                                updatePart(p);
                              }}
                            />
                            {chosen.shape === "weight" && (
                              <Range
                                label="配重质量"
                                value={chosen.loadMass}
                                min={10}
                                max={1500}
                                step={1}
                                unit="kg"
                                onChange={(v) =>
                                  updatePart({ ...chosen, loadMass: v })
                                }
                              />
                            )}
                            <div className="house-tools">
                              <button
                                className="button button-secondary"
                                onClick={anchor}
                              >
                                固定到地基
                              </button>
                              <button
                                className="button button-ghost"
                                onClick={() =>
                                  change({
                                    ...workspace,
                                    design: {
                                      ...design,
                                      connections: design.connections.filter(
                                        (c) =>
                                          c.a !== chosen.id &&
                                          c.b !== chosen.id,
                                      ),
                                    },
                                  })
                                }
                              >
                                解除连接
                              </button>
                              <button
                                className="button button-ghost"
                                onClick={remove}
                              >
                                移走这块
                              </button>
                            </div>
                            <details>
                              <summary>家长：自定义材料倍率</summary>
                              <p className="house-hint">
                                1
                                倍对应材料表。改变倍率是对照实验，不代表真实材料等级。
                              </p>
                              <Range
                                label="强度倍率"
                                value={chosen.strength}
                                min={0.1}
                                max={10}
                                step={0.1}
                                onChange={(v) =>
                                  updatePart({ ...chosen, strength: v })
                                }
                              />
                              <Range
                                label="刚度倍率"
                                value={chosen.stiffness}
                                min={0.1}
                                max={10}
                                step={0.1}
                                onChange={(v) =>
                                  updatePart({ ...chosen, stiffness: v })
                                }
                              />
                            </details>
                          </>
                        ) : null}
                      </section>
                    </fieldset>
                  </>
                )}
                <details className="house-section">
                  <summary>承载设置</summary>
                  <fieldset
                    className="house-controls"
                    disabled={loaded !== "ready" || (!building && active)}
                  >
                    <Range
                      label="地基承载上限"
                      value={design.settings.groundCapacity / 1000}
                      min={0.1}
                      max={100000}
                      step={0.1}
                      logarithmic
                      unit="kN"
                      onChange={(v) => setting({ groundCapacity: v * 1000 })}
                    />
                    <Range
                      label="新连接承载上限"
                      value={design.settings.connectionStrength / 1000}
                      min={0.1}
                      max={10000}
                      step={0.1}
                      logarithmic
                      unit="kN"
                      onChange={(v) =>
                        setting({ connectionStrength: v * 1000 })
                      }
                    />
                  </fieldset>
                </details>
                <details className="house-section">
                  <summary>示例建筑</summary>
                  <fieldset
                    className="house-controls house-tools"
                    disabled={!building || loaded !== "ready"}
                  >
                    {EXAMPLES.map((ex) => (
                      <button
                        className="button button-ghost"
                        key={ex.id}
                        onClick={() => {
                          change({
                            ...workspace,
                            design: exampleDesign(ex.id),
                            view: {
                              ...view,
                              ...DEFAULT_VIEW,
                              showMass: view.showMass,
                              showCenter: view.showCenter,
                            },
                          });
                          setSelected(undefined);
                          setNotice("示例已加载，可撤销恢复上一份搭建。");
                        }}
                      >
                        {ex.name}
                      </button>
                    ))}
                  </fieldset>
                </details>
                <details className="house-section">
                  <summary>通关记录（{records.length}）</summary>
                  {historyStatus && <p>{historyStatus}</p>}
                  {historyStatus.includes("失败") && (
                    <button
                      className="button button-ghost"
                      onClick={() => setHistoryAttempt((n) => n + 1)}
                    >
                      重试读取记录
                    </button>
                  )}
                  {recordStatus && <p role="status">{recordStatus}</p>}
                  {pendingCount > 0 && (
                    <button
                      className="button button-secondary"
                      disabled={recordBusy}
                      onClick={() =>
                        void (async () => {
                          for (const r of pendingRecords.current.values())
                            await saveRecord(r);
                        })()
                      }
                    >
                      重试保存 {pendingCount} 条记录
                    </button>
                  )}
                  {!records.length && !historyStatus && (
                    <p className="house-hint">
                      打开任意随机任务并通关，记录就会出现在这里。
                    </p>
                  )}
                  {[...records]
                    .reverse()
                    .slice(0, recordLimit)
                    .map((r) => (
                      <details key={r.id} className="house-record">
                        <summary>
                          {new Date(r.createdAt).toLocaleString("zh-CN")} ·{" "}
                          {fmt(r.result.maxHeight, 1)} 米
                        </summary>
                        <Report record={r} />
                        <button
                          className="button button-secondary"
                          disabled={loaded !== "ready"}
                          onClick={() => restore(r)}
                        >
                          加载方案继续编辑
                        </button>
                      </details>
                    ))}
                  {records.length > recordLimit && (
                    <button
                      className="button button-ghost"
                      onClick={() => setRecordLimit((n) => n + 20)}
                    >
                      查看更多记录
                    </button>
                  )}
                </details>
                <p className="house-hint house-section">
                  材料参数参考真实材料的量级。二维模型简化了裂纹、钢材屈服与气流，适合做对照实验，不用于工程设计。
                </p>
              </>
            )}
          </aside>
        )}
      </div>
      <dialog
        ref={dialog}
        className="house-success"
        onCancel={() => setCompleted(undefined)}
        aria-labelledby="house-success-title"
      >
        {completed && (
          <>
            <div className="house-success-badge" aria-hidden="true">
              ★
            </div>
            <h2 id="house-success-title">恭喜你完成任务！</h2>
            <p>你的建筑经受住了 10 秒考验。</p>
            <Report record={completed} />
            <p role="status">{recordStatus}</p>
            <div className="house-tools">
              {pendingRecords.current.has(completed.id) && (
                <button
                  className="button button-secondary"
                  disabled={recordBusy}
                  onClick={() => void saveRecord(completed)}
                >
                  重试保存记录
                </button>
              )}
              <button
                className="button button-primary"
                onClick={() => {
                  closeReport();
                  returnToBuild();
                }}
              >
                继续搭建
              </button>
              <button className="button button-ghost" onClick={closeReport}>
                查看实验现场
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
