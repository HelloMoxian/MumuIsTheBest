import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ELEMENTS } from "../periodic-table/elements.generated";
import { FurnaceCanvas, type FurnaceCanvasHandle } from "../reaction-furnace/FurnaceCanvas";
import { MoleculeStructurePreview } from "../reaction-furnace/MoleculeStructurePreview";
import { REACTION_COMPOUNDS, COMPOUND_KIND_LABELS } from "../reaction-furnace/compound-library";
import { getReactionElementTheme } from "../reaction-furnace/element-colors";
import { consumeAtomCounts, type AtomCounts, type ReactionCompound } from "../reaction-furnace/logic";
import {
  addTreasureBasinAtom,
  buildTreasureBasinLibrary,
  canAddTreasureBasinElementBatch,
  discoverPolyatomicIons,
  findTreasureBasinMatch,
  findTreasureBasinMatches,
  indexTreasureBasinDiscoveries,
  MOLECULE_FACTORY_SUGGESTION_DURATION_MS,
  MOLECULE_FACTORY_SUGGESTION_LIMIT,
  planTreasureBasinCompoundAssembly,
  POLYATOMIC_IONS,
  TREASURE_BASIN_ELEMENT_LIMIT,
  TREASURE_BASIN_FREE_ATOM_LIMIT,
  treasureBasinAtomTotal,
  treasureBasinElementBatchSize,
  type PolyatomicIon,
} from "./logic";
import {
  readChemistryLocalCache,
  writeChemistryLocalCache,
  type ChemistryCacheMetadata,
} from "../chemistry-local-cache";
import "../reaction-furnace/reaction-furnace.css";
import "./molecule-factory.css";

const BASIN_ELEMENTS = ELEMENTS.slice(0, TREASURE_BASIN_ELEMENT_LIMIT);
const BASIN_SYMBOLS = new Set(BASIN_ELEMENTS.map((element) => element.symbol));
const BASIN_COMPOUNDS = buildTreasureBasinLibrary(
  REACTION_COMPOUNDS,
  BASIN_SYMBOLS,
);
const BASIN_COMPOUND_BY_ID = new Map(BASIN_COMPOUNDS.map((compound) => [compound.id, compound]));
const POLYATOMIC_ION_BY_ID = new Map(POLYATOMIC_IONS.map((ion) => [ion.id, ion]));
const MATCH_DELAY_MS = 520;
const FACTORY_CACHE_KEY = "mumu.chemistry.molecule-factory";
const FACTORY_CACHE_STABLE_ID = "chemistry-molecule-factory";

type BasinCachePayload = {
  pool: AtomCounts;
  discoveryIds: readonly string[];
  selectedSymbol: string;
  assemblingId: string | null;
  excludeOrganic: boolean;
  autoAssemble: boolean;
  formedIonIds: readonly string[];
};

type BasinInitialState = {
  pool: AtomCounts;
  discoveries: readonly ReactionCompound[];
  selectedSymbol: string;
  excludeOrganic: boolean;
  autoAssemble: boolean;
  formedIons: readonly PolyatomicIon[];
  cacheMetadata?: ChemistryCacheMetadata;
};

type FactorySuggestion = {
  compound: ReactionCompound;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBasinPool(value: unknown) {
  if (!isRecord(value)) return undefined;
  const pool: Record<string, number> = {};
  let total = 0;
  for (const [symbol, count] of Object.entries(value)) {
    if (
      !BASIN_SYMBOLS.has(symbol)
      || typeof count !== "number"
      || !Number.isSafeInteger(count)
      || count <= 0
    ) {
      return undefined;
    }
    total += count;
    if (total > TREASURE_BASIN_FREE_ATOM_LIMIT) return undefined;
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

function parseBasinCachePayload(value: unknown): BasinCachePayload | undefined {
  if (!isRecord(value) || !Array.isArray(value.discoveryIds)) return undefined;
  if (value.discoveryIds.some((id) => typeof id !== "string")) return undefined;
  const discoveryIds = [...value.discoveryIds] as string[];
  if (
    new Set(discoveryIds).size !== discoveryIds.length
    || discoveryIds.some((id) => !BASIN_COMPOUND_BY_ID.has(id))
    || typeof value.selectedSymbol !== "string"
    || !BASIN_SYMBOLS.has(value.selectedSymbol)
  ) {
    return undefined;
  }
  const assemblingId = value.assemblingId === null
    ? null
    : typeof value.assemblingId === "string" ? value.assemblingId : undefined;
  if (
    assemblingId === undefined
    || (assemblingId !== null && (
      !BASIN_COMPOUND_BY_ID.has(assemblingId)
      || discoveryIds.includes(assemblingId)
    ))
  ) {
    return undefined;
  }
  const pool = readBasinPool(value.pool);
  if (!pool) return undefined;
  const excludeOrganic = value.excludeOrganic ?? false;
  const autoAssemble = value.autoAssemble ?? true;
  const formedIonIds = value.formedIonIds ?? [];
  if (
    typeof excludeOrganic !== "boolean"
    || typeof autoAssemble !== "boolean"
    || !Array.isArray(formedIonIds)
    || formedIonIds.some((id) => typeof id !== "string" || !POLYATOMIC_ION_BY_ID.has(id))
    || new Set(formedIonIds).size !== formedIonIds.length
  ) {
    return undefined;
  }
  const recoveredPool = assemblingId === null
    ? pool
    : addAtomCounts(pool, BASIN_COMPOUND_BY_ID.get(assemblingId)!.atomCounts);
  if (treasureBasinAtomTotal(recoveredPool) > TREASURE_BASIN_FREE_ATOM_LIMIT) return undefined;
  return {
    pool,
    discoveryIds,
    selectedSymbol: value.selectedSymbol,
    assemblingId,
    excludeOrganic,
    autoAssemble,
    formedIonIds: [...formedIonIds] as string[],
  };
}

const FACTORY_CACHE_SPEC = {
  key: FACTORY_CACHE_KEY,
  stableId: FACTORY_CACHE_STABLE_ID,
  parsePayload: parseBasinCachePayload,
  migrateLegacy(value: unknown) {
    if (!isRecord(value)) return undefined;
    return parseBasinCachePayload({
      pool: value.pool ?? {},
      discoveryIds: value.discoveryIds ?? value.completedIds ?? [],
      selectedSymbol: value.selectedSymbol ?? BASIN_ELEMENTS[0].symbol,
      assemblingId: value.assemblingId ?? null,
      excludeOrganic: value.excludeOrganic ?? false,
      autoAssemble: value.autoAssemble ?? true,
      formedIonIds: value.formedIonIds ?? [],
    });
  },
};

const LEGACY_TREASURE_BASIN_CACHE_SPEC = {
  ...FACTORY_CACHE_SPEC,
  key: "mumu.chemistry.treasure-basin",
  stableId: "chemistry-treasure-basin",
};

const LEGACY_TREASURE_BOX_CACHE_SPEC = {
  ...FACTORY_CACHE_SPEC,
  key: "mumu.chemistry.treasure-box",
  stableId: "chemistry-treasure-box",
};

function createInitialState(): BasinInitialState {
  const restored = readChemistryLocalCache(FACTORY_CACHE_SPEC)
    ?? readChemistryLocalCache(LEGACY_TREASURE_BASIN_CACHE_SPEC)
    ?? readChemistryLocalCache(LEGACY_TREASURE_BOX_CACHE_SPEC);
  if (!restored) {
    return {
      pool: {},
      discoveries: [],
      selectedSymbol: BASIN_ELEMENTS[0].symbol,
      excludeOrganic: false,
      autoAssemble: true,
      formedIons: [],
    };
  }
  const pool = restored.payload.assemblingId === null
    ? restored.payload.pool
    : addAtomCounts(
      restored.payload.pool,
      BASIN_COMPOUND_BY_ID.get(restored.payload.assemblingId)!.atomCounts,
    );
  return {
    pool,
    discoveries: restored.payload.discoveryIds.map((id) => BASIN_COMPOUND_BY_ID.get(id)!),
    selectedSymbol: restored.payload.selectedSymbol,
    excludeOrganic: restored.payload.excludeOrganic,
    autoAssemble: restored.payload.autoAssemble,
    formedIons: restored.payload.formedIonIds.map((id) => POLYATOMIC_ION_BY_ID.get(id)!),
    cacheMetadata: restored.metadata,
  };
}

export function MoleculeFactoryPage() {
  const [initialState] = useState(createInitialState);
  const [pool, setPool] = useState<AtomCounts>(initialState.pool);
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(
    new Set(initialState.discoveries.map((compound) => compound.id)),
  );
  const [discoveries, setDiscoveries] = useState<readonly ReactionCompound[]>(initialState.discoveries);
  const [selectedSymbol, setSelectedSymbol] = useState(initialState.selectedSymbol);
  const [assemblingId, setAssemblingId] = useState<string | null>(null);
  const [formingIonId, setFormingIonId] = useState<string | null>(null);
  const [excludeOrganic, setExcludeOrganic] = useState(initialState.excludeOrganic);
  const [autoAssemble, setAutoAssemble] = useState(initialState.autoAssemble);
  const [formedIons, setFormedIons] = useState<readonly PolyatomicIon[]>(initialState.formedIons);
  const [suggestions, setSuggestions] = useState<readonly FactorySuggestion[]>([]);
  const [statusText, setStatusText] = useState(
    initialState.cacheMetadata
      ? "已恢复上次的分子工厂探索，可以继续投放原子。"
      : "点击右侧元素，把第一个原子送进反应区。",
  );

  const canvasRef = useRef<FurnaceCanvasHandle>(null);
  const poolRef = useRef<AtomCounts>(initialState.pool);
  const completedIdsRef = useRef(new Set(initialState.discoveries.map((compound) => compound.id)));
  const assemblingIdRef = useRef<string | null>(null);
  const formingIonIdRef = useRef<string | null>(null);
  const excludeOrganicRef = useRef(initialState.excludeOrganic);
  const autoAssembleRef = useRef(initialState.autoAssemble);
  const formedIonIdsRef = useRef(new Set(initialState.formedIons.map((ion) => ion.id)));
  const formedIonsRef = useRef<readonly PolyatomicIon[]>(initialState.formedIons);
  const previousSuggestionIdsRef = useRef<ReadonlySet<string>>(new Set());
  const matchTimerRef = useRef<number | null>(null);
  const suggestionTimerRef = useRef<number | null>(null);
  const evaluatePoolRef = useRef<() => void>(() => undefined);
  const cacheMetadataRef = useRef<ChemistryCacheMetadata | undefined>(initialState.cacheMetadata);
  const restoredCanvasRef = useRef(false);

  const freeAtomCount = treasureBasinAtomTotal(pool);
  const factoryBusy = Boolean(assemblingId || formingIonId);
  const formingIon = formingIonId ? POLYATOMIC_ION_BY_ID.get(formingIonId) : undefined;
  const assemblingCompound = assemblingId ? BASIN_COMPOUND_BY_ID.get(assemblingId) : undefined;
  const discoveriesByElement = useMemo(
    () => indexTreasureBasinDiscoveries(discoveries),
    [discoveries],
  );
  const selectedElement = BASIN_ELEMENTS.find(
    (element) => element.symbol === selectedSymbol,
  ) ?? BASIN_ELEMENTS[0];
  const selectedDiscoveries = discoveriesByElement[selectedElement.symbol] ?? [];
  const poolEntries = useMemo(
    () => Object.entries(pool)
      .filter(([, count]) => count > 0)
      .sort(([first], [second]) => (
        (ELEMENTS.find((element) => element.symbol === first)?.atomicNumber ?? 999)
        - (ELEMENTS.find((element) => element.symbol === second)?.atomicNumber ?? 999)
      )),
    [pool],
  );

  const clearSuggestions = useCallback(() => {
    if (suggestionTimerRef.current !== null) {
      window.clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = null;
    }
    setSuggestions([]);
  }, []);

  const scheduleMatch = useCallback((delay = MATCH_DELAY_MS) => {
    if (matchTimerRef.current !== null) window.clearTimeout(matchTimerRef.current);
    matchTimerRef.current = window.setTimeout(() => {
      matchTimerRef.current = null;
      evaluatePoolRef.current();
    }, delay);
  }, []);

  useEffect(() => {
    if (restoredCanvasRef.current || !canvasRef.current) return;
    for (const [symbol, count] of Object.entries(pool)) {
      canvasRef.current.addAtoms(symbol, count);
    }
    for (const ion of initialState.formedIons) {
      canvasRef.current.addPolyatomicIon(ion);
    }
    restoredCanvasRef.current = true;
    if (treasureBasinAtomTotal(pool) > 0 || initialState.formedIons.length > 0) scheduleMatch(120);
  }, [pool, scheduleMatch]);

  useEffect(() => {
    const nextMetadata = writeChemistryLocalCache(
      FACTORY_CACHE_SPEC,
      {
        pool,
        discoveryIds: discoveries.map((compound) => compound.id),
        selectedSymbol,
        assemblingId,
        excludeOrganic,
        autoAssemble,
        formedIonIds: formedIons.map((ion) => ion.id),
      },
      cacheMetadataRef.current,
    );
    if (nextMetadata) cacheMetadataRef.current = nextMetadata;
  }, [assemblingId, autoAssemble, discoveries, excludeOrganic, formedIons, pool, selectedSymbol]);

  const startIonFormation = useCallback((ion: PolyatomicIon) => {
    if (
      assemblingIdRef.current
      || formingIonIdRef.current
      || formedIonIdsRef.current.has(ion.id)
    ) return false;
    const started = canvasRef.current?.formPolyatomicIon(ion) ?? false;
    if (!started) return false;
    clearSuggestions();
    formingIonIdRef.current = ion.id;
    setFormingIonId(ion.id);
    setStatusText(`${ion.name}正在构建：游离原子会先靠近、连接，再稳定成 ${ion.formula}。`);
    return true;
  }, [clearSuggestions]);

  const handlePolyatomicIonComplete = useCallback((ion: PolyatomicIon) => {
    if (formingIonIdRef.current !== ion.id) return;
    poolRef.current = consumeAtomCounts(poolRef.current, ion.atomCounts);
    setPool(poolRef.current);
    formedIonIdsRef.current.add(ion.id);
    formedIonsRef.current = [...formedIonsRef.current, ion];
    setFormedIons(formedIonsRef.current);
    formingIonIdRef.current = null;
    setFormingIonId(null);
    setStatusText(`${ion.formula} ${ion.name}已经稳定，可以整团参加下一次化合物构建。`);
    scheduleMatch(220);
  }, [scheduleMatch]);

  const startAssembly = useCallback((target: ReactionCompound) => {
    const plan = planTreasureBasinCompoundAssembly(
      poolRef.current,
      formedIonsRef.current,
      target,
    );
    if (
      assemblingIdRef.current
      || formingIonIdRef.current
      || completedIdsRef.current.has(target.id)
      || (excludeOrganicRef.current && target.family === "organic")
      || !plan
    ) return;
    const started = canvasRef.current?.assemble(target, 0, plan.ionIds) ?? false;
    if (!started) {
      scheduleMatch(100);
      return;
    }
    clearSuggestions();
    poolRef.current = consumeAtomCounts(poolRef.current, plan.freeAtomCounts);
    setPool(poolRef.current);
    if (plan.ionIds.length > 0) {
      const consumedIonIds = new Set(plan.ionIds);
      for (const ionId of consumedIonIds) formedIonIdsRef.current.delete(ionId);
      formedIonsRef.current = formedIonsRef.current.filter((ion) => !consumedIonIds.has(ion.id));
      setFormedIons(formedIonsRef.current);
    }
    assemblingIdRef.current = target.id;
    setAssemblingId(target.id);
    const ionNames = plan.ionIds
      .map((ionId) => POLYATOMIC_ION_BY_ID.get(ionId)?.name)
      .filter(Boolean)
      .join("、");
    setStatusText(ionNames
      ? `${ionNames}正保持完整结构，与其余游离原子一起构建 ${target.formula}。`
      : `${target.formula} 的原子正在排队靠近，准备组成${target.name}。`);
  }, [clearSuggestions, scheduleMatch]);

  const showManualSuggestions = useCallback(() => {
    clearSuggestions();
    const candidates = findTreasureBasinMatches(
      poolRef.current,
      BASIN_COMPOUNDS,
      completedIdsRef.current,
      {
        excludeOrganic: excludeOrganicRef.current,
        limit: MOLECULE_FACTORY_SUGGESTION_LIMIT,
        random: Math.random,
        avoidIds: previousSuggestionIdsRef.current,
        formedIons: formedIonsRef.current,
      },
    );
    if (candidates.length === 0) {
      if (treasureBasinAtomTotal(poolRef.current) > 0 || formedIonsRef.current.length > 0) {
        setStatusText("这些原子和原子团正在做布朗运动，继续加入元素寻找新伙伴。");
      }
      return;
    }
    previousSuggestionIdsRef.current = new Set(candidates.map((compound) => compound.id));
    setSuggestions(candidates.map((compound) => ({ compound })));
    setStatusText(`发现 ${candidates.length} 种可以合成的物质，点底部提示卡选择一个。`);
    suggestionTimerRef.current = window.setTimeout(() => {
      suggestionTimerRef.current = null;
      setSuggestions([]);
      if (
        !autoAssembleRef.current
        && !assemblingIdRef.current
        && !formingIonIdRef.current
        && (treasureBasinAtomTotal(poolRef.current) > 0 || formedIonsRef.current.length > 0)
      ) {
        setStatusText("这一批提示已经飘走，正在寻找下一批可以合成的物质。");
        scheduleMatch(180);
      }
    }, MOLECULE_FACTORY_SUGGESTION_DURATION_MS);
  }, [clearSuggestions, scheduleMatch]);

  const evaluatePool = useCallback(() => {
    if (assemblingIdRef.current || formingIonIdRef.current) return;
    const nextIon = discoverPolyatomicIons(poolRef.current, formedIonIdsRef.current)[0];
    if (nextIon && startIonFormation(nextIon)) return;
    if (!autoAssembleRef.current) {
      showManualSuggestions();
      return;
    }
    const target = findTreasureBasinMatch(
      poolRef.current,
      BASIN_COMPOUNDS,
      completedIdsRef.current,
      {
        excludeOrganic: excludeOrganicRef.current,
        formedIons: formedIonsRef.current,
      },
    );
    if (target) {
      startAssembly(target);
    } else if (treasureBasinAtomTotal(poolRef.current) > 0 || formedIonsRef.current.length > 0) {
      setStatusText("这些原子正在做布朗运动，继续加入元素寻找新伙伴。");
    }
  }, [showManualSuggestions, startAssembly, startIonFormation]);
  evaluatePoolRef.current = evaluatePool;

  const handleAssemblyComplete = useCallback((compound: ReactionCompound) => {
    completedIdsRef.current.add(compound.id);
    setCompletedIds(new Set(completedIdsRef.current));
    setDiscoveries((current) => [compound, ...current]);
    assemblingIdRef.current = null;
    setAssemblingId(null);
    setStatusText(`${compound.formula} ${compound.name}已经进入成品收藏架，本次不会重复生成。`);
    scheduleMatch(260);
  }, [scheduleMatch]);

  const addElement = (symbol: string, chineseName: string) => {
    setSelectedSymbol(symbol);
    const batchSize = treasureBasinElementBatchSize(symbol);
    if (!canAddTreasureBasinElementBatch(poolRef.current, symbol)) {
      setStatusText("反应区已经很热闹啦，先等原子组成物质，或清空游离原子。");
      return;
    }
    poolRef.current = addTreasureBasinAtom(poolRef.current, symbol, batchSize);
    setPool(poolRef.current);
    canvasRef.current?.addAtoms(symbol, batchSize);
    setStatusText(`${chineseName}原子已进入反应区，构建队列会逐个检查原子团和化合物。`);
    scheduleMatch();
  };

  const removeDiscovery = (compound: ReactionCompound) => {
    completedIdsRef.current.delete(compound.id);
    setCompletedIds(new Set(completedIdsRef.current));
    setDiscoveries((current) => current.filter((item) => item.id !== compound.id));
    setStatusText(`${compound.formula} ${compound.name}已从成品架移除，现在可以重新合成。`);
    scheduleMatch(120);
  };

  const clearFreeAtoms = () => {
    if (assemblingIdRef.current || formingIonIdRef.current) return;
    poolRef.current = {};
    setPool({});
    clearSuggestions();
    previousSuggestionIdsRef.current = new Set();
    formedIonIdsRef.current = new Set();
    formedIonsRef.current = [];
    setFormedIons([]);
    canvasRef.current?.reset();
    setStatusText("游离原子和原子团已清空，成品收藏仍然保留。");
  };

  const restart = () => {
    if (matchTimerRef.current !== null) window.clearTimeout(matchTimerRef.current);
    poolRef.current = {};
    completedIdsRef.current = new Set();
    formedIonIdsRef.current = new Set();
    formedIonsRef.current = [];
    previousSuggestionIdsRef.current = new Set();
    assemblingIdRef.current = null;
    formingIonIdRef.current = null;
    setPool({});
    setCompletedIds(new Set());
    setDiscoveries([]);
    setFormedIons([]);
    clearSuggestions();
    setAssemblingId(null);
    setFormingIonId(null);
    setStatusText("新的分子工厂已经准备好，点击右侧元素开始探索。");
    canvasRef.current?.reset();
  };

  useEffect(() => () => {
    if (matchTimerRef.current !== null) window.clearTimeout(matchTimerRef.current);
    if (suggestionTimerRef.current !== null) window.clearTimeout(suggestionTimerRef.current);
  }, []);

  const changeExcludeOrganic = (checked: boolean) => {
    excludeOrganicRef.current = checked;
    setExcludeOrganic(checked);
    clearSuggestions();
    previousSuggestionIdsRef.current = new Set();
    setStatusText(checked ? "已开启不创造有机物，只会匹配无机物。" : "有机物已经重新加入可合成目录。");
    if (treasureBasinAtomTotal(poolRef.current) > 0 || formedIonsRef.current.length > 0) scheduleMatch(80);
  };

  const changeAutoAssemble = (checked: boolean) => {
    autoAssembleRef.current = checked;
    setAutoAssemble(checked);
    clearSuggestions();
    previousSuggestionIdsRef.current = new Set();
    setStatusText(checked
      ? "自动合成已开启，配方满足后工厂会自动开始。"
      : "自动合成已关闭，配方满足后请点击底部漂浮提示卡。"
    );
    if (treasureBasinAtomTotal(poolRef.current) > 0 || formedIonsRef.current.length > 0) scheduleMatch(80);
  };

  return (
    <div className="furnace-page treasure-page">
      <div className="furnace-stars" aria-hidden="true" />
      <header className="treasure-topbar">
        <a href="/" className="treasure-back" aria-label="返回学习大厅">← 大厅</a>
        <div className="treasure-title">
          <span aria-hidden="true">✦</span>
          <strong>分子工厂</strong>
          <small>投放原子，选择或自动合成物质</small>
        </div>
        <div className="treasure-top-stats" aria-label="探索统计">
          <span><strong>{freeAtomCount}</strong> 游离原子</span>
          <span><strong>{formedIons.length}</strong> 个原子团</span>
          <span><strong>{discoveries.length}</strong> 种发现</span>
        </div>
        <fieldset className="factory-options" disabled={factoryBusy}>
          <legend className="sr-only">分子工厂合成选项</legend>
          <label>
            <input
              type="checkbox"
              checked={excludeOrganic}
              onChange={(event) => changeExcludeOrganic(event.target.checked)}
            />
            <span aria-hidden="true">✓</span>
            <strong>不创造有机物</strong>
          </label>
          <label>
            <input
              type="checkbox"
              checked={autoAssemble}
              onChange={(event) => changeAutoAssemble(event.target.checked)}
            />
            <span aria-hidden="true">✓</span>
            <strong>自动合成</strong>
          </label>
        </fieldset>
        <div className="treasure-actions">
          <button type="button" onClick={clearFreeAtoms} disabled={(freeAtomCount === 0 && formedIons.length === 0) || factoryBusy}>
            清空原子和原子团
          </button>
          <button type="button" onClick={restart}>重新开始</button>
        </div>
      </header>

      <main className="treasure-main">
        <section className="treasure-workspace">
          <div className="treasure-reactor-column">
            <article className="treasure-reactor">
              <header>
                <div>
                  <span className={factoryBusy ? "reactor-status is-assembling" : "reactor-status"}>
                    <i aria-hidden="true" />
                    {formingIonId
                      ? "正在构建原子团"
                      : assemblingId
                        ? "正在组成新物质"
                      : freeAtomCount
                        ? "游离原子布朗运动中"
                        : formedIons.length ? "原子团自由漂浮中" : "反应区等待原子"}
                  </span>
                  <p aria-live="polite">{statusText}</p>
                </div>
                <span className="virtual-only">虚拟组成演示，不是实验步骤</span>
              </header>
              <div className="treasure-canvas-shell">
                <FurnaceCanvas
                  ref={canvasRef}
                  mode="eject"
                  targetCount={1}
                  freeParticleSpeed={0.5}
                  onAssemblyComplete={handleAssemblyComplete}
                  onPolyatomicIonComplete={handlePolyatomicIonComplete}
                />
                {freeAtomCount === 0 && formedIons.length === 0 && !factoryBusy && (
                  <div className="treasure-empty">
                    <span aria-hidden="true">✦</span>
                    <strong>从右侧点一个元素</strong>
                    <p>{autoAssemble
                      ? "连续点击投入多个原子，配方满足后会自动组成物质。"
                      : "连续点击投入多个原子，配方满足后点底部提示卡来合成。"}</p>
                  </div>
                )}
                {factoryBusy && (
                  <div
                    className={`factory-build-banner ${formingIon ? "is-ion" : "is-compound"}`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className="factory-build-sparkles" aria-hidden="true">✦ · ✧ · ✦</span>
                    <small>串行构建队列 · 当前第 1 项</small>
                    <strong>{formingIon
                      ? `${formingIon.formula} ${formingIon.name}`
                      : `${assemblingCompound?.formula ?? "新物质"} ${assemblingCompound?.name ?? ""}`}</strong>
                    <em>{formingIon
                      ? "原子正在靠近，连接成一个特别的带电伙伴"
                      : "原子团与游离原子正在共同合并，完成后再构建下一项"}</em>
                  </div>
                )}
                {suggestions.length > 0 && !autoAssemble && (
                  <div className="factory-suggestions" aria-label="可合成物质提示" aria-live="polite">
                    {suggestions.map(({ compound }, index) => (
                      <button
                        type="button"
                        key={compound.id}
                        style={{ "--suggestion-index": index } as CSSProperties}
                        onClick={() => startAssembly(compound)}
                        aria-label={`合成${compound.formula}${compound.name}`}
                      >
                        <strong>{compound.formula}</strong>
                        <span>{compound.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {(poolEntries.length > 0 || formedIons.length > 0) && (
                  <div className="treasure-pool-readout" aria-label="反应区游离原子和原子团">
                    {poolEntries.map(([symbol, count]) => (
                      <span key={symbol}><strong>{symbol}</strong> ×{count}</span>
                    ))}
                    {formedIons.map((ion) => (
                      <span className="is-polyatomic-ion" key={ion.id}>
                        <strong>{ion.formula}</strong> ×1 <small>{ion.name} · 电荷 {ion.chargeLabel}</small>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <section className="treasure-shelf" aria-labelledby="treasure-shelf-title">
              <header>
                <div>
                  <p>FACTORY OUTPUT</p>
                  <h2 id="treasure-shelf-title">成品收藏架</h2>
                </div>
                <span>已收集 {completedIds.size} 种 · 最新生成的排在最上面</span>
              </header>
              {discoveries.length === 0 ? (
                <div className="treasure-shelf-empty">
                  <span aria-hidden="true">↓</span>
                  <p>工厂成品会落到这里。可以先试试氧元素。</p>
                </div>
              ) : (
                <div className="treasure-card-list">
                  {discoveries.map((compound, index) => (
                    <article className="treasure-card" key={compound.id}>
                      <span className="treasure-order">
                        #{String(discoveries.length - index).padStart(2, "0")}
                      </span>
                      <div className="treasure-card-structure">
                        <MoleculeStructurePreview compound={compound} />
                      </div>
                      <div>
                        <strong>{compound.formula}</strong>
                        <h3>{compound.name}</h3>
                        <p>{compound.feature}</p>
                        <small>✓ {COMPOUND_KIND_LABELS[compound.kind]} · 已收藏</small>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="treasure-periodic" aria-labelledby="treasure-periodic-title">
            <header>
              <div>
                <p>ELEMENT PICKER</p>
                <h2 id="treasure-periodic-title">元素选择表</h2>
              </div>
              <span>1—90</span>
            </header>
            <p className="treasure-periodic-help">
              按原子序数紧凑排列，点击元素即可投放原子。
            </p>
            <div className="treasure-periodic-scroll">
              <div className="treasure-periodic-grid">
                {BASIN_ELEMENTS.map((element) => {
                  const theme = getReactionElementTheme(element.symbol);
                  const discoveryCount = discoveriesByElement[element.symbol]?.length ?? 0;
                  const freeCount = pool[element.symbol] ?? 0;
                  const isSelected = selectedSymbol === element.symbol;
                  const batchSize = treasureBasinElementBatchSize(element.symbol);
                  return (
                    <button
                      type="button"
                      key={element.atomicNumber}
                      className={`category-${element.category}${isSelected ? " is-selected" : ""}`}
                      style={{
                        "--element-color": theme.color,
                        "--element-rgb": theme.rgb,
                      } as CSSProperties}
                      onClick={() => addElement(element.symbol, element.chineseName)}
                      aria-pressed={isSelected}
                      aria-label={`投入${batchSize}个${element.chineseName}原子并查看合成物，元素符号${element.symbol}，原子序数${element.atomicNumber}，已收集${discoveryCount}种，当前游离${freeCount}个`}
                      title={`${element.atomicNumber} · ${element.chineseName} · ${element.symbol} · 物 ${discoveryCount} · 原 ${freeCount}`}
                    >
                      <small className="treasure-element-number">{element.atomicNumber}</small>
                      <span className="treasure-element-identity">
                        <strong className="treasure-element-symbol">{element.symbol}</strong>
                        <span className="treasure-element-name">{element.chineseName}</span>
                      </span>
                      <span className="treasure-element-metrics" aria-hidden="true">
                        <span>物 {discoveryCount}</span>
                        <span>原 {freeCount}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <section
                className="treasure-element-discoveries"
                aria-labelledby="treasure-element-discoveries-title"
              >
                <header>
                  <div>
                    <small>{selectedElement.symbol}</small>
                    <h3 id="treasure-element-discoveries-title">
                      {selectedElement.chineseName}的已合成物
                    </h3>
                  </div>
                  <span>{selectedDiscoveries.length} 种</span>
                </header>
                {selectedDiscoveries.length === 0 ? (
                  <p className="treasure-element-discoveries-empty">
                    还没有收集含{selectedElement.chineseName}的物质。
                  </p>
                ) : (
                  <ul>
                    {selectedDiscoveries.map((compound) => (
                      <li key={compound.id}>
                        <div>
                          <strong>{compound.formula}</strong>
                          <span>{compound.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDiscovery(compound)}
                          aria-label={`移除${compound.formula}${compound.name}，允许重新合成`}
                        >
                          <span aria-hidden="true">×</span> 移除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
