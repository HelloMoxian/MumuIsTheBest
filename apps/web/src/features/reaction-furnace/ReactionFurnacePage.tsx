import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ELEMENTS } from "../periodic-table/elements.generated";
import {
  COMPOUND_KIND_LABELS,
  REACTION_COMPOUNDS,
} from "./compound-library";
import {
  FurnaceCanvas,
  type FurnaceCanvasHandle,
} from "./FurnaceCanvas";
import { MoleculeStructurePreview } from "./MoleculeStructurePreview";
import { getReactionElementTheme } from "./element-colors";
import {
  buildAtomBundles,
  consumeAtomCounts,
  findCompletableCompound,
  REACTION_FURNACE_ATOM_BUDGET,
  REACTION_FURNACE_MIN_DISTINCT_ELEMENT_COUNT,
  REACTION_FURNACE_ORGANIC_COUNT,
  REACTION_FURNACE_PRIORITY_ELEMENT_COUNT,
  REACTION_FURNACE_TARGET_COUNT,
  selectReactionRoundPlan,
  type AtomBundle,
  type AtomCounts,
  type ReactionCompound,
} from "./logic";
import {
  readChemistryLocalCache,
  writeChemistryLocalCache,
  type ChemistryCacheMetadata,
} from "../chemistry-local-cache";
import {
  chemistryDiscoverySpeech,
  LocalizedLines,
  speakLearningMoment,
} from "../../shared/experience";
import "./reaction-furnace.css";

const ELEMENT_BY_SYMBOL = new Map(ELEMENTS.map((element) => [element.symbol, element]));
const COMPOUND_BY_ID = new Map(REACTION_COMPOUNDS.map((compound) => [compound.id, compound]));
const REACTION_FURNACE_CACHE_KEY = "mumu.chemistry.reaction-furnace";
const REACTION_FURNACE_CACHE_STABLE_ID = "chemistry-reaction-furnace";

type FurnaceCachePayload = {
  targetIds: readonly string[];
  targetElements: readonly string[];
  usedBundleIds: readonly string[];
  pool: AtomCounts;
  completedIds: readonly string[];
  assemblingId: string | null;
  batchNumber: number;
};

type FurnaceInitialState = {
  round: ReturnType<typeof freshRound>;
  usedBundleIds: ReadonlySet<string>;
  pool: AtomCounts;
  completedIds: ReadonlySet<string>;
  batchNumber: number;
  cacheMetadata?: ChemistryCacheMetadata;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readUniqueIds(
  value: unknown,
  knownIds: ReadonlySet<string>,
  options: { exactLength?: number; maximumLength?: number } = {},
) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  if (options.exactLength !== undefined && value.length !== options.exactLength) return undefined;
  if (options.maximumLength !== undefined && value.length > options.maximumLength) return undefined;
  const ids = [...value] as string[];
  if (new Set(ids).size !== ids.length || ids.some((id) => !knownIds.has(id))) return undefined;
  return ids;
}

function readPool(value: unknown, allowedSymbols: ReadonlySet<string>) {
  if (!isRecord(value)) return undefined;
  const pool: Record<string, number> = {};
  let total = 0;
  for (const [symbol, count] of Object.entries(value)) {
    if (
      !allowedSymbols.has(symbol)
      || typeof count !== "number"
      || !Number.isSafeInteger(count)
      || count <= 0
    ) {
      return undefined;
    }
    total += count;
    if (total > REACTION_FURNACE_ATOM_BUDGET) return undefined;
    pool[symbol] = count;
  }
  return pool;
}

function addAtomCounts(first: AtomCounts, second: AtomCounts): AtomCounts {
  const next = { ...first };
  for (const [symbol, count] of Object.entries(second)) {
    next[symbol] = (next[symbol] ?? 0) + count;
  }
  return next;
}

function atomCountsEqual(first: AtomCounts, second: AtomCounts) {
  const symbols = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...symbols].every((symbol) => (first[symbol] ?? 0) === (second[symbol] ?? 0));
}

function parseFurnaceCachePayload(value: unknown): FurnaceCachePayload | undefined {
  if (!isRecord(value)) return undefined;
  const targetIds = readUniqueIds(
    value.targetIds,
    new Set(COMPOUND_BY_ID.keys()),
    { exactLength: REACTION_FURNACE_TARGET_COUNT },
  );
  if (!targetIds) return undefined;
  const targets = targetIds.map((id) => COMPOUND_BY_ID.get(id)!);
  const targetSymbols = new Set(targets.flatMap((compound) => Object.keys(compound.atomCounts)));
  const targetElements = readUniqueIds(
    value.targetElements,
    new Set(ELEMENT_BY_SYMBOL.keys()),
    { exactLength: REACTION_FURNACE_PRIORITY_ELEMENT_COUNT },
  );
  if (!targetElements || targetElements.some((symbol) => !targetSymbols.has(symbol))) return undefined;

  const bundles = buildAtomBundles(targets);
  const usedBundleIds = readUniqueIds(
    value.usedBundleIds,
    new Set(bundles.map((bundle) => bundle.id)),
    { maximumLength: bundles.length },
  );
  const completedIds = readUniqueIds(
    value.completedIds,
    new Set(targetIds),
    { maximumLength: targetIds.length },
  );
  const assemblingId = value.assemblingId === null
    ? null
    : typeof value.assemblingId === "string" ? value.assemblingId : undefined;
  if (
    !usedBundleIds
    || !completedIds
    || assemblingId === undefined
    || (assemblingId !== null && (!targetIds.includes(assemblingId) || completedIds.includes(assemblingId)))
    || typeof value.batchNumber !== "number"
    || !Number.isSafeInteger(value.batchNumber)
    || value.batchNumber < 1
  ) {
    return undefined;
  }
  const pool = readPool(value.pool, targetSymbols);
  if (!pool) return undefined;

  const launchedAtoms = usedBundleIds.reduce<AtomCounts>((totals, id) => {
    const bundle = bundles.find((item) => item.id === id)!;
    return addAtomCounts(totals, { [bundle.symbol]: bundle.count });
  }, {});
  const consumedAtoms = completedIds.reduce<AtomCounts>((totals, id) => (
    addAtomCounts(totals, COMPOUND_BY_ID.get(id)!.atomCounts)
  ), assemblingId === null ? {} : COMPOUND_BY_ID.get(assemblingId)!.atomCounts);
  let expectedPool: AtomCounts;
  try {
    expectedPool = consumeAtomCounts(launchedAtoms, consumedAtoms);
  } catch {
    return undefined;
  }
  if (!atomCountsEqual(pool, expectedPool)) return undefined;

  return {
    targetIds,
    targetElements,
    usedBundleIds,
    pool,
    completedIds,
    assemblingId,
    batchNumber: value.batchNumber,
  };
}

const FURNACE_CACHE_SPEC = {
  key: REACTION_FURNACE_CACHE_KEY,
  stableId: REACTION_FURNACE_CACHE_STABLE_ID,
  parsePayload: parseFurnaceCachePayload,
  migrateLegacy(value: unknown) {
    if (!isRecord(value)) return undefined;
    return parseFurnaceCachePayload({
      targetIds: value.targetIds,
      targetElements: value.priorityElements,
      usedBundleIds: value.usedBundleIds ?? [],
      pool: value.pool ?? {},
      completedIds: value.completedIds ?? [],
      assemblingId: value.assemblingId ?? null,
      batchNumber: value.batchNumber ?? 1,
    });
  },
};

function freshRound() {
  return selectReactionRoundPlan(REACTION_COMPOUNDS);
}

function createInitialState(): FurnaceInitialState {
  const restored = readChemistryLocalCache(FURNACE_CACHE_SPEC);
  if (restored) {
    const targets = restored.payload.targetIds.map((id) => COMPOUND_BY_ID.get(id)!);
    const recoveredPool = restored.payload.assemblingId === null
      ? restored.payload.pool
      : addAtomCounts(
        restored.payload.pool,
        COMPOUND_BY_ID.get(restored.payload.assemblingId)!.atomCounts,
      );
    return {
      round: { targetElements: restored.payload.targetElements, compounds: targets },
      usedBundleIds: new Set(restored.payload.usedBundleIds),
      pool: recoveredPool,
      completedIds: new Set(restored.payload.completedIds),
      batchNumber: restored.payload.batchNumber,
      cacheMetadata: restored.metadata,
    };
  }
  return {
    round: freshRound(),
    usedBundleIds: new Set(),
    pool: {},
    completedIds: new Set(),
    batchNumber: 1,
  };
}

function addToPool(pool: AtomCounts, bundle: AtomBundle) {
  return {
    ...pool,
    [bundle.symbol]: (pool[bundle.symbol] ?? 0) + bundle.count,
  };
}

export function ReactionFurnacePage() {
  const [initialState] = useState(createInitialState);
  const [round, setRound] = useState(initialState.round);
  const targets = round.compounds;
  const bundles = useMemo(() => buildAtomBundles(targets), [targets]);
  const [usedBundleIds, setUsedBundleIds] = useState<ReadonlySet<string>>(initialState.usedBundleIds);
  const [pool, setPool] = useState<AtomCounts>(initialState.pool);
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(initialState.completedIds);
  const [assemblingId, setAssemblingId] = useState<string | null>(null);
  const [latestCompound, setLatestCompound] = useState<ReactionCompound | null>(null);
  const [batchNumber, setBatchNumber] = useState(initialState.batchNumber);

  const canvasRef = useRef<FurnaceCanvasHandle>(null);
  const poolRef = useRef<AtomCounts>(initialState.pool);
  const completedIdsRef = useRef(new Set(initialState.completedIds));
  const assemblingIdRef = useRef<string | null>(null);
  const tryAssemblyRef = useRef<() => void>(() => undefined);
  const cacheMetadataRef = useRef<ChemistryCacheMetadata | undefined>(initialState.cacheMetadata);
  const restoredCanvasRef = useRef(false);

  const remainingBundles = useMemo(
    () => bundles.filter((bundle) => !usedBundleIds.has(bundle.id)),
    [bundles, usedBundleIds],
  );
  const inventoryGroups = useMemo(() => {
    const groups = new Map<string, AtomBundle[]>();
    for (const bundle of remainingBundles) {
      groups.set(bundle.symbol, [...(groups.get(bundle.symbol) ?? []), bundle]);
    }
    return [...groups.entries()]
      .sort(([first], [second]) => (
        (ELEMENT_BY_SYMBOL.get(first)?.atomicNumber ?? 999)
        - (ELEMENT_BY_SYMBOL.get(second)?.atomicNumber ?? 999)
      ));
  }, [remainingBundles]);
  const atomsRemaining = remainingBundles.reduce((total, bundle) => total + bundle.count, 0);
  const atomsInFurnace = Object.values(pool).reduce((total, count) => total + count, 0);

  useEffect(() => {
    if (restoredCanvasRef.current || !canvasRef.current) return;
    for (const [symbol, count] of Object.entries(pool)) {
      canvasRef.current.addAtoms(symbol, count);
    }
    for (const [index, compound] of targets.entries()) {
      if (completedIds.has(compound.id)) {
        canvasRef.current.restoreStableCompound(compound, index);
      }
    }
    restoredCanvasRef.current = true;
  }, [completedIds, pool, targets]);

  useEffect(() => {
    const nextMetadata = writeChemistryLocalCache(
      FURNACE_CACHE_SPEC,
      {
        targetIds: targets.map((compound) => compound.id),
        targetElements: [...round.targetElements],
        usedBundleIds: [...usedBundleIds],
        pool,
        completedIds: [...completedIds],
        assemblingId,
        batchNumber,
      },
      cacheMetadataRef.current,
    );
    if (nextMetadata) cacheMetadataRef.current = nextMetadata;
  }, [assemblingId, batchNumber, completedIds, pool, round.targetElements, targets, usedBundleIds]);

  const tryAssembly = useCallback(() => {
    if (assemblingIdRef.current) return;
    const target = findCompletableCompound(
      poolRef.current,
      targets,
      completedIdsRef.current,
    );
    if (!target) return;

    const slotIndex = targets.findIndex((compound) => compound.id === target.id);
    const started = canvasRef.current?.assemble(target, slotIndex) ?? false;
    if (!started) {
      window.setTimeout(() => tryAssemblyRef.current(), 80);
      return;
    }
    poolRef.current = consumeAtomCounts(poolRef.current, target.atomCounts);
    setPool(poolRef.current);
    assemblingIdRef.current = target.id;
    setAssemblingId(target.id);
  }, [targets]);
  tryAssemblyRef.current = tryAssembly;

  const handleAssemblyComplete = useCallback((compound: ReactionCompound) => {
    completedIdsRef.current.add(compound.id);
    setCompletedIds(new Set(completedIdsRef.current));
    assemblingIdRef.current = null;
    setAssemblingId(null);
    setLatestCompound(compound);
    void speakLearningMoment(chemistryDiscoverySpeech({
      formula: compound.formula,
      nameZh: compound.name,
      nameEn: compound.nameEnglish,
    }));
    window.setTimeout(() => tryAssemblyRef.current(), 260);
  }, []);

  const launchBundle = (bundle: AtomBundle) => {
    setUsedBundleIds((used) => new Set([...used, bundle.id]));
    poolRef.current = addToPool(poolRef.current, bundle);
    setPool(poolRef.current);
    canvasRef.current?.addAtoms(bundle.symbol, bundle.count);
    window.setTimeout(() => tryAssemblyRef.current(), 90);
  };

  const resetBatch = () => {
    const nextRound = freshRound();
    setRound(nextRound);
    setUsedBundleIds(new Set());
    setPool({});
    poolRef.current = {};
    setCompletedIds(new Set());
    completedIdsRef.current = new Set();
    setAssemblingId(null);
    assemblingIdRef.current = null;
    setLatestCompound(null);
    setBatchNumber((number) => number + 1);
    canvasRef.current?.reset();
  };

  return (
    <div className="furnace-page">
      <div className="furnace-stars" aria-hidden="true" />
      <header className="furnace-topbar">
        <a href="/" className="furnace-back"><span aria-hidden="true">←</span> 学习大厅</a>
        <div className="furnace-brand">
          <span aria-hidden="true">⚗</span>
          <div><strong>反应熔炉</strong><small>木木的微观组装舱</small></div>
        </div>
        <button type="button" className="new-batch-button" onClick={resetBatch}>
          <span aria-hidden="true">↻</span> 换一批 10 种
        </button>
      </header>

      <main className="furnace-main">
        <section className="furnace-heading">
          <div>
            <p>第 {batchNumber} 批 · 从 {REACTION_COMPOUNDS.length} 种物质中随机选择</p>
            <h1 data-no-ui-translation>
              <LocalizedLines
                zh={<>把原子投入熔炉，<em>看它们组成物质。</em></>}
                en={<>Send atoms into the furnace, <em>and watch them form substances.</em></>}
              />
            </h1>
          </div>
          <div className="furnace-summary" aria-label="当前进度">
            <span><strong>{completedIds.size}</strong><small>/ {REACTION_FURNACE_TARGET_COUNT} 已稳定</small></span>
            <span><strong>{atomsInFurnace}</strong><small>游离原子</small></span>
            <span><strong>{atomsRemaining}</strong><small>仓内原子</small></span>
          </div>
        </section>

        <section className="furnace-workspace">
          <article className="reactor-panel">
            <header>
              <div>
                <span className={assemblingId ? "reactor-status is-assembling" : "reactor-status"}>
                  <i aria-hidden="true" />
                  {assemblingId ? "原子正在聚合" : atomsInFurnace ? "布朗运动中" : "等待投放原子"}
                </span>
                <small>背景扰动 · 粒子碰撞 · 自动匹配</small>
              </div>
              <span className="virtual-only">虚拟组成演示，不是实验步骤</span>
            </header>
            <div className="canvas-shell">
              <FurnaceCanvas
                ref={canvasRef}
                targetCount={targets.length}
                onAssemblyComplete={handleAssemblyComplete}
              />
              {!atomsInFurnace && completedIds.size === 0 && !assemblingId && (
                <div className="reactor-empty">
                  <span aria-hidden="true">✦</span>
                  <strong>从右侧选择一个原子</strong>
                  <p>原子会飞入这里，配方齐全后自动寻找伙伴。</p>
                </div>
              )}
              {latestCompound && (
                <aside className="latest-molecule" aria-live="polite">
                  <button
                    type="button"
                    aria-label="关闭稳定结构提示"
                    onClick={() => setLatestCompound(null)}
                  >
                    ×
                  </button>
                  <span>稳定结构已形成</span>
                  <strong>{latestCompound.formula}</strong>
                  <h2>{latestCompound.name}</h2>
                  <p>{latestCompound.feature}</p>
                </aside>
              )}
            </div>
          </article>

          <aside className="atom-vault" aria-labelledby="atom-vault-title">
            <header>
              <div>
                <p>ATOM VAULT</p>
                <h2 id="atom-vault-title">原子仓</h2>
              </div>
              <span>{remainingBundles.length} 组</span>
            </header>
            <p className="vault-help">
              点击原子送入反应炉。数量多时会装进 <strong>×10</strong> 能量包。
            </p>
            <div className="atom-group-list">
              {inventoryGroups.map(([symbol, symbolBundles]) => {
                const element = ELEMENT_BY_SYMBOL.get(symbol);
                const elementTheme = getReactionElementTheme(symbol);
                const remaining = symbolBundles.reduce((total, bundle) => total + bundle.count, 0);
                return (
                  <section
                    className={`atom-group category-${element?.category ?? "unknown"}`}
                    key={symbol}
                    style={{
                      "--category-color": elementTheme.color,
                      "--category-rgb": elementTheme.rgb,
                    } as CSSProperties}
                  >
                    <div className="atom-group-heading">
                      <span><strong>{symbol}</strong><small>{element?.chineseName ?? symbol}</small></span>
                      <em>剩余 {remaining}</em>
                    </div>
                    <div className="atom-bundles">
                      {symbolBundles.map((bundle) => (
                        <button
                          type="button"
                          key={bundle.id}
                          onClick={() => launchBundle(bundle)}
                          aria-label={`投放${bundle.count}个${element?.chineseName ?? symbol}原子`}
                        >
                          <strong>{symbol}</strong>
                          {bundle.count > 1 ? <span>×{bundle.count}</span> : <span>投放</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
              {remainingBundles.length === 0 && (
                <div className="vault-empty">
                  <span aria-hidden="true">✓</span>
                  <strong>原子已经全部投放</strong>
                  <p>等待反应炉完成最后的组合。</p>
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className="target-deck" aria-labelledby="target-deck-title">
          <header>
            <div>
              <p>本批随机目标</p>
              <h2 id="target-deck-title">10 张物质星图</h2>
            </div>
            <span>
              {REACTION_FURNACE_ORGANIC_COUNT} 种有机物 · 至少{" "}
              {REACTION_FURNACE_MIN_DISTINCT_ELEMENT_COUNT} 种元素 · 总原子不超过{" "}
              {REACTION_FURNACE_ATOM_BUDGET} 个 · 完成 {completedIds.size}/{REACTION_FURNACE_TARGET_COUNT}
            </span>
          </header>
          <p className="priority-element-list">
            本批先抽取的 {REACTION_FURNACE_PRIORITY_ELEMENT_COUNT} 种优先元素：{" "}
            <strong>{round.targetElements.join(" · ")}</strong>
          </p>
          <div className="structure-legend" aria-label="结构线条说明">
            <span><i className="is-solid" aria-hidden="true" />实线：有资料支持的化学键或晶格连接</span>
            <span><i className="is-dashed" aria-hidden="true" />虚线：配方单元组成示意，不代表共价键</span>
          </div>
          <div className="target-grid">
            {targets.map((compound, index) => {
              const completed = completedIds.has(compound.id);
              const assembling = assemblingId === compound.id;
              const structureLabel = compound.structure.representation === "composition-schematic"
                ? "虚线组成示意"
                : compound.structure.representation === "representative-lattice"
                  ? "典型结构片段"
                  : "球棍结构";
              return (
                <article
                  className={`target-card ${completed ? "is-completed" : ""} ${assembling ? "is-assembling" : ""}`}
                  key={compound.id}
                >
                  <span className="target-index">{completed ? "✓" : String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{compound.formula}</strong>
                    <h3>{compound.name}</h3>
                    <p>{compound.feature}</p>
                  </div>
                  <div
                    className={`target-structure ${completed ? "is-ready" : ""} ${assembling ? "is-building" : ""}`}
                  >
                    {completed ? (
                      <MoleculeStructurePreview compound={compound} />
                    ) : (
                      <>
                        <span aria-hidden="true"><i /><i /><i /></span>
                        <small>
                          {assembling ? `${structureLabel}正在形成` : `组合成功后显示${structureLabel}`}
                        </small>
                      </>
                    )}
                  </div>
                  <span className="target-kind">
                    {assembling ? "正在聚合" : completed ? "结构稳定" : COMPOUND_KIND_LABELS[compound.kind]}
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
