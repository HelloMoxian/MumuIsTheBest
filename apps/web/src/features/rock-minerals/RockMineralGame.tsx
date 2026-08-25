import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import catalogAsset from "../../../../../content/nature/rock-mineral-catalog.v1.json";
import {
  LearningCoinBalancePill,
  useLearningCoinStatus,
} from "../../shared/LearningCoinLayer";
import {
  RockMineralApiError,
  createRockMineralProgress,
  loadEnergyCoinBalance,
  loadRockMineralProgress,
  purchaseGeologyHammer,
  saveRockMineralProgress,
  spendResearchKnowledgeCoins,
} from "./api";
import {
  addPurchasedHammer,
  averageHardness,
  cancelResearch,
  completeResearch,
  createInitialProgress,
  isCellAccessible,
  prepareResearch,
  remainingResearchAttributes,
  researchCompletion,
  strikeCell,
} from "./logic";
import {
  RESEARCH_ATTRIBUTE_KEYS,
  type CatalogSortKey,
  type DigCell,
  type MineralCatalogItem,
  type ResearchAttributeKey,
  type RockMineralCatalog,
  type RockMineralProgress,
} from "./types";
import "./rock-minerals.css";

const catalog = catalogAsset as RockMineralCatalog;
const itemById = new Map(catalog.items.map((item) => [item.id, item]));

const ATTRIBUTE_LABELS: Record<ResearchAttributeKey, string> = {
  name: "样本名称",
  classification: "分类身份",
  crystalStructure: "晶体结构",
  formation: "自然成因",
  rarity: "稀有度",
  mohsHardness: "莫氏硬度",
  introduction: "认识它",
  chemicalComposition: "主要化学组成",
  uses: "主要用途",
  products: "常见制成物",
  value: "价值",
  safety: "安全观察",
};

const KIND_LABELS: Record<MineralCatalogItem["kind"], string> = {
  mineral: "矿物",
  variety: "宝石/矿物变种",
  rock: "岩石",
  "ore-aggregate": "矿石集合体",
};

const SORT_LABELS: Array<{ key: CatalogSortKey; label: string }> = [
  { key: "discovery", label: "发现顺序" },
  { key: "name", label: "名称" },
  { key: "kind", label: "类型" },
  { key: "rarity", label: "稀有度" },
  { key: "hardness", label: "莫氏硬度" },
  { key: "value", label: "价值" },
  { key: "inventory", label: "库存" },
  { key: "research", label: "研究进度" },
];

function isUnlocked(
  progress: RockMineralProgress,
  mineralId: string,
  key: ResearchAttributeKey,
) {
  return progress.unlockedAttributes[mineralId]?.includes(key) ?? false;
}

function itemName(progress: RockMineralProgress, item: MineralCatalogItem) {
  if (isUnlocked(progress, item.id, "name")) return item.name;
  return `未知样本 #${progress.discoveredIds.indexOf(item.id) + 1}`;
}

function attributeValue(item: MineralCatalogItem, key: ResearchAttributeKey): ReactNode {
  if (key === "name") {
    return <><strong>{item.name}</strong>{item.aliases.length > 0 && <small>别名：{item.aliases.join("、")}</small>}</>;
  }
  if (key === "classification") {
    return <><strong>{KIND_LABELS[item.kind]}</strong><small>{item.group}</small></>;
  }
  if (key === "crystalStructure") {
    return <><strong>{item.crystalStructure.system}</strong><small>{item.crystalStructure.detail}</small></>;
  }
  if (key === "formation") return item.formation;
  if (key === "rarity") return <Meter value={item.rarity} label={`${item.rarity} / 10`} />;
  if (key === "mohsHardness") {
    return <><Meter value={averageHardness(item)} label={item.mohsHardness.description} /><small>{catalog.semantics.hardnessNote}</small></>;
  }
  if (key === "introduction") return item.introduction;
  if (key === "chemicalComposition") {
    return <><strong>{item.chemicalComposition.formula}</strong><small>{item.chemicalComposition.summary}</small></>;
  }
  if (key === "uses") return <ChipList values={item.uses} />;
  if (key === "products") return <ChipList values={item.products} />;
  if (key === "value") {
    return <><Meter value={item.value.score} label={`${item.value.score} / 10 · ${item.value.label}`} /><small>{item.value.description}</small></>;
  }
  return item.safety;
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span className="geo-meter">
      <span><i style={{ "--meter": `${Math.max(0, Math.min(10, value)) * 10}%` } as CSSProperties} /></span>
      <b>{label}</b>
    </span>
  );
}

function ChipList({ values }: { values: string[] }) {
  return <span className="geo-chip-list">{values.map((value) => <i key={value}>{value}</i>)}</span>;
}

function playHitSound(kind: "soil" | "mineral") {
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.connect(context.destination);
  const now = context.currentTime;
  gain.gain.setValueAtTime(kind === "soil" ? 0.11 : 0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === "soil" ? 0.16 : 0.28));

  if (kind === "mineral") {
    for (const [frequency, offset] of [[720, 0], [1_180, 0.035]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + 0.24);
      oscillator.connect(gain);
      oscillator.start(now + offset);
      oscillator.stop(now + 0.27);
    }
  } else {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.18), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 480;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    source.start(now);
  }
  window.setTimeout(() => void context.close(), 500);
}

type SaveState = "loading" | "ready" | "saving" | "error";
type ImpactKind = "soil" | "chip" | "mineral";

type ImpactFragment = {
  id: string;
  style: CSSProperties;
};

type ImpactBurst = {
  id: string;
  x: number;
  y: number;
  kind: ImpactKind;
  soilVariant: DigCell["soilVariant"];
  fragments: ImpactFragment[];
};

function cellsInVisualOrder(cells: DigCell[]) {
  const visualRows = new Map<string, number>();
  for (let column = 0; column < catalog.gameplay.columns; column += 1) {
    cells
      .filter((cell) => cell.column === column)
      .sort((left, right) => left.depth - right.depth)
      .forEach((cell, row) => visualRows.set(cell.id, row));
  }
  return cells.slice().sort((left, right) => (
    (visualRows.get(left.id) ?? 0) - (visualRows.get(right.id) ?? 0)
    || left.column - right.column
  ));
}

export function RockMineralGame() {
  const { status: learningCoins } = useLearningCoinStatus();
  const [progress, setProgress] = useState<RockMineralProgress | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [message, setMessage] = useState("正在读取你的钻探记录…");
  const [activeView, setActiveView] = useState<"dig" | "catalog">("dig");
  const [sortKey, setSortKey] = useState<CatalogSortKey>("discovery");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [energyBalance, setEnergyBalance] = useState<number | null>(null);
  const [energyError, setEnergyError] = useState<string | null>(null);
  const [hammerPointer, setHammerPointer] = useState<{ x: number; y: number } | null>(null);
  const [hammerSwing, setHammerSwing] = useState(0);
  const [impactBursts, setImpactBursts] = useState<ImpactBurst[]>([]);
  const [discovery, setDiscovery] = useState<{ item: MineralCatalogItem; first: boolean } | null>(null);
  const discoveryTimer = useRef<number | null>(null);
  const burstTimers = useRef<number[]>([]);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadEnergyCoinBalance(controller.signal)
      .then((balance) => {
        setEnergyBalance(balance.balance);
        setEnergyError(null);
      })
      .catch((error) => {
        if ((error as DOMException).name !== "AbortError") {
          setEnergyError(error instanceof Error ? error.message : "能量币余额暂时无法读取。");
        }
      });

    void (async () => {
      try {
        const stored = await loadRockMineralProgress(catalog, controller.signal);
        let next = stored?.payload ?? createInitialProgress(catalog);
        if (!stored) await createRockMineralProgress(next, catalog);

        if (next.pendingResearch) {
          try {
            await spendResearchKnowledgeCoins(
              next.pendingResearch.eventId,
              catalog.gameplay.research.knowledgeCoinCost,
            );
            next = completeResearch(next);
            await saveRockMineralProgress(next, catalog);
            setMessage("上次中断的研究已经安全完成。");
          } catch (error) {
            if (error instanceof Error && error.message.includes("还不够")) {
              next = cancelResearch(next);
              await saveRockMineralProgress(next, catalog);
            } else {
              setMessage("上次研究还在安全等待中，网络恢复后可以继续。");
            }
          }
        }

        if (next.pendingHammerPurchase) {
          try {
            const purchase = await purchaseGeologyHammer(
              catalog.gameplay.hammer.energyCoinAdapter,
              next.pendingHammerPurchase.eventId,
              catalog.gameplay.hammer.energyCoinCost,
            );
            next = {
              ...addPurchasedHammer(next, catalog),
              pendingHammerPurchase: null,
            };
            await saveRockMineralProgress(next, catalog);
            setEnergyBalance(purchase.balance);
            setMessage("上次中断的地质锤购买已经安全完成。");
          } catch (error) {
            if (error instanceof RockMineralApiError && error.code === "INSUFFICIENT_ENERGY_COINS") {
              next = { ...next, pendingHammerPurchase: null };
              await saveRockMineralProgress(next, catalog);
            } else {
              setMessage("地质锤购买还在安全等待中，网络恢复后可以继续。");
            }
          }
        }
        setProgress(next);
        setSelectedId(next.discoveredIds[0] ?? null);
        setSaveState("ready");
        if (!next.pendingResearch && !next.pendingHammerPurchase && stored) {
          setMessage("钻探记录已恢复。先敲每列最上方发光的格子。");
        }
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
        setSaveState("error");
        setMessage(error instanceof Error ? error.message : "钻探记录暂时无法读取。");
      }
    })();

    return () => {
      controller.abort();
      if (discoveryTimer.current !== null) window.clearTimeout(discoveryTimer.current);
      burstTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const commit = async (next: RockMineralProgress, nextMessage: string) => {
    setProgress(next);
    setSaveState("saving");
    setMessage(nextMessage);
    try {
      await saveRockMineralProgress(next, catalog);
      setSaveState("ready");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "这次进度暂时无法保存。");
      throw error;
    }
  };

  const spawnImpactBurst = (
    cell: DigCell,
    sourceElement: HTMLButtonElement,
    kind: ImpactKind,
    mineral?: MineralCatalogItem,
  ) => {
    const wrapper = gridWrapRef.current;
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const cellRect = sourceElement.getBoundingClientRect();
    const count = kind === "mineral" ? 18 : kind === "soil" ? 14 : 6;
    const columns = kind === "chip" ? 3 : 4;
    const fragments = Array.from({ length: count }, (_, index): ImpactFragment => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const startX = ((column + 0.5) / columns - 0.5) * cellRect.width * 0.68
        + (Math.random() - 0.5) * 7;
      const rowCount = Math.ceil(count / columns);
      const startY = ((row + 0.5) / rowCount - 0.5) * cellRect.height * 0.58
        + (Math.random() - 0.5) * 7;
      const direction = index / (count - 1) - 0.5;
      const landX = direction * cellRect.width * (kind === "chip" ? 1.05 : 1.65)
        + (Math.random() - 0.5) * 32;
      const landY = (kind === "chip" ? 38 : 66) + Math.random() * (kind === "chip" ? 45 : 92);
      const upwardVelocity = -(kind === "chip" ? 42 : 78)
        - Math.random() * (kind === "chip" ? 48 : 102);
      const halfAcceleration = landY - upwardVelocity;
      const fallCurve = Array.from({ length: 25 }, (_, step) => {
        const time = step / 24;
        const verticalPosition = upwardVelocity * time + halfAcceleration * time * time;
        return `${(verticalPosition / landY).toFixed(4)} ${(time * 100).toFixed(2)}%`;
      }).join(", ");
      const size = Math.max(
        kind === "chip" ? 5 : 8,
        Math.min(kind === "chip" ? 10 : 18, cellRect.width * (0.09 + Math.random() * 0.07)),
      );
      const spin = (Math.random() > 0.5 ? 1 : -1) * (170 + Math.random() * 430);
      const delay = Math.random() * 55;
      const duration = kind === "chip" ? 620 + Math.random() * 180 : 820 + Math.random() * 260;
      const style = {
        "--start-x": `${startX}px`,
        "--start-y": `${startY}px`,
        "--land-x": `${landX}px`,
        "--land-y": `${landY}px`,
        "--spin-end": `${spin}deg`,
        "--fall-curve": `linear(${fallCurve})`,
        "--fragment-delay": `${delay}ms`,
        "--fragment-duration": `${duration}ms`,
        "--fragment-image": mineral
          ? `linear-gradient(145deg, rgba(255,255,255,.18), transparent 42%), url("${mineral.image.path}")`
          : undefined,
        "--fragment-position": mineral
          ? `center, ${Math.round(Math.random() * 100)}% ${Math.round(Math.random() * 100)}%`
          : undefined,
        width: `${size}px`,
        height: `${size * (0.68 + Math.random() * 0.5)}px`,
      } as CSSProperties;
      return { id: `${index}-${Math.random().toString(36).slice(2)}`, style };
    });
    const id = crypto.randomUUID();
    setImpactBursts((current) => [
      ...current.slice(-3),
      {
        id,
        x: cellRect.left - wrapperRect.left + cellRect.width / 2,
        y: cellRect.top - wrapperRect.top + cellRect.height / 2,
        kind,
        soilVariant: cell.soilVariant,
        fragments,
      },
    ]);
    const timer = window.setTimeout(() => {
      setImpactBursts((current) => current.filter((burst) => burst.id !== id));
    }, 1_300);
    burstTimers.current.push(timer);
  };

  const handleStrike = (cellId: string, sourceElement: HTMLButtonElement) => {
    if (!progress || saveState === "saving") return;
    setHammerSwing((value) => value + 1);
    const struckCell = progress.board.cells.find((cell) => cell.id === cellId);
    const result = strikeCell(progress, cellId, catalog);
    if (result.outcome === "blocked") {
      setMessage("先把它上方的格子挖开，就能继续向下。");
      return;
    }
    if (result.outcome === "no-hammer") {
      setMessage("地质锤没有耐久了。可以用 30 枚能量币购买一把新的。");
      return;
    }
    if (progress.soundEnabled) {
      playHitSound(result.outcome === "soil" ? "soil" : "mineral");
    }
    if (result.outcome === "soil") {
      if (struckCell) spawnImpactBurst(struckCell, sourceElement, "soil");
      void commit(result.progress, `泥土已经清开，钻孔到达 ${result.progress.currentDepth} 米。`);
      return;
    }
    if (result.outcome === "crack") {
      const crackedMineral = struckCell?.mineralId
        ? itemById.get(struckCell.mineralId)
        : undefined;
      if (struckCell) spawnImpactBurst(struckCell, sourceElement, "chip", crackedMineral);
      void commit(result.progress, "下面有坚硬的东西！裂纹变深了，再敲一次看看。");
      return;
    }
    const item = result.collectedMineralId
      ? itemById.get(result.collectedMineralId)
      : undefined;
    if (item) {
      if (struckCell) spawnImpactBurst(struckCell, sourceElement, "mineral", item);
      setDiscovery({ item, first: result.firstDiscovery });
      if (discoveryTimer.current !== null) window.clearTimeout(discoveryTimer.current);
      discoveryTimer.current = window.setTimeout(() => setDiscovery(null), 1_450);
      if (result.firstDiscovery) setSelectedId(item.id);
    }
    void commit(
      result.progress,
      result.firstDiscovery ? "发现一个从未见过的新样本！图片已收入图鉴。" : "又收集到一份熟悉的样本，库存增加了。",
    );
  };

  const handleResearch = async (item: MineralCatalogItem) => {
    if (!progress || saveState === "saving" || progress.pendingResearch) return;
    const cost = catalog.gameplay.research.knowledgeCoinCost;
    if ((progress.inventory[item.id] ?? 0) < 1) {
      setMessage("这个样本现在没有库存，继续挖到一份再研究。");
      return;
    }
    if (remainingResearchAttributes(progress, item.id).length === 0) {
      setMessage("这个样本的全部词条都已经研究完成。");
      return;
    }
    if ((learningCoins?.coinBalance ?? 0) < cost) {
      setMessage(`研究需要 ${cost} 个知识币，当前余额还不够。`);
      return;
    }
    const prepared = prepareResearch(progress, item.id, crypto.randomUUID());
    if (!prepared.pendingResearch) return;
    try {
      await commit(prepared, "正在把样本送入研究舱…");
      await spendResearchKnowledgeCoins(prepared.pendingResearch.eventId, cost);
      const completed = completeResearch(prepared);
      await commit(
        completed,
        `研究完成：解锁“${ATTRIBUTE_LABELS[prepared.pendingResearch.attributeKey]}”。`,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("还不够")) {
        const cancelled = cancelResearch(prepared);
        await commit(cancelled, error.message);
      } else {
        setMessage(error instanceof Error ? error.message : "研究暂时中断，稍后可以安全继续。");
      }
    }
  };

  const handlePurchaseHammer = async () => {
    if (!progress || saveState === "saving" || progress.pendingHammerPurchase) return;
    const cost = catalog.gameplay.hammer.energyCoinCost;
    if ((energyBalance ?? 0) < cost) {
      setMessage(`购买一把地质锤需要 ${cost} 枚能量币。`);
      return;
    }
    const eventId = crypto.randomUUID();
    const pending = { ...progress, pendingHammerPurchase: { eventId } };
    try {
      await commit(pending, "正在从能量币钱包购买地质锤…");
      const purchase = await purchaseGeologyHammer(
        catalog.gameplay.hammer.energyCoinAdapter,
        eventId,
        cost,
      );
      const completed = {
        ...addPurchasedHammer(pending, catalog),
        pendingHammerPurchase: null,
      };
      setEnergyBalance(purchase.balance);
      await commit(completed, "地质锤已放入工具舱，可以继续向下挖！");
    } catch (error) {
      if (error instanceof RockMineralApiError && error.code === "INSUFFICIENT_ENERGY_COINS") {
        await commit({ ...pending, pendingHammerPurchase: null }, error.message);
      } else {
        setMessage(error instanceof Error ? error.message : "购买暂时中断，稍后可以安全继续。");
      }
    }
  };

  const toggleSound = () => {
    if (!progress) return;
    const next = { ...progress, soundEnabled: !progress.soundEnabled };
    void commit(next, next.soundEnabled ? "敲击音效已打开。" : "敲击音效已关闭。");
  };

  const discoveredItems = useMemo(() => {
    if (!progress) return [];
    const items = progress.discoveredIds
      .map((id) => itemById.get(id))
      .filter((item): item is MineralCatalogItem => Boolean(item));
    const discoveryOrder = new Map(progress.discoveredIds.map((id, index) => [id, index]));
    const valueFor = (item: MineralCatalogItem): string | number => {
      if (sortKey === "discovery") return discoveryOrder.get(item.id) ?? 0;
      if (sortKey === "name") return item.name;
      if (sortKey === "kind") return `${item.kind}:${item.group}`;
      if (sortKey === "rarity") return item.rarity;
      if (sortKey === "hardness") return averageHardness(item);
      if (sortKey === "value") return item.value.score;
      if (sortKey === "inventory") return progress.inventory[item.id] ?? 0;
      return researchCompletion(progress, item.id);
    };
    return items.sort((left, right) => {
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      const comparison = typeof leftValue === "string"
        ? leftValue.localeCompare(String(rightValue), "zh-CN")
        : Number(leftValue) - Number(rightValue);
      return (sortDirection === "asc" ? comparison : -comparison)
        || (discoveryOrder.get(left.id) ?? 0) - (discoveryOrder.get(right.id) ?? 0);
    });
  }, [progress, sortDirection, sortKey]);

  const selectedItem = selectedId ? itemById.get(selectedId) ?? null : null;
  const hammerCount = progress
    ? progress.spareHammers + (progress.currentHammerDurability > 0 ? 1 : 0)
    : 0;

  if (!progress) {
    return (
      <main className="geo-page geo-loading" aria-live="polite">
        <div className="geo-stars" aria-hidden="true" />
        <section><span aria-hidden="true">◇</span><h1>正在连接地质探索舱…</h1><p>{message}</p></section>
      </main>
    );
  }

  return (
    <main className="geo-page">
      <div className="geo-stars" aria-hidden="true" />
      <header className="geo-header">
        <a className="geo-back" href="/">← 返回学习岛</a>
        <div className="geo-title">
          <span aria-hidden="true">◇</span>
          <div><small>自然 · 地质探索舱</small><h1>岩石与矿物</h1></div>
        </div>
        <div className="geo-head-stats" aria-label="钻探状态">
          <span><small>当前深度</small><strong>{progress.currentDepth} m</strong></span>
          <span><small>地质锤</small><strong>{hammerCount} 把</strong></span>
          <span><small>当前耐久</small><strong>{progress.currentHammerDurability}</strong></span>
          <span><small>已发现</small><strong>{progress.discoveredIds.length} / {catalog.itemCount}</strong></span>
        </div>
        <LearningCoinBalancePill className="geo-learning-coins" />
      </header>

      <nav className="geo-tabs" aria-label="岩石与矿物区域">
        <button className={activeView === "dig" ? "is-active" : ""} type="button" onClick={() => setActiveView("dig")}>
          <span aria-hidden="true">⌄</span> 地层钻探
        </button>
        <button className={activeView === "catalog" ? "is-active" : ""} type="button" onClick={() => setActiveView("catalog")}>
          <span aria-hidden="true">▦</span> 发现图鉴
          <b>{progress.discoveredIds.length}</b>
        </button>
      </nav>

      <p className={`geo-status is-${saveState}`} role="status" aria-live="polite">
        <span aria-hidden="true">{saveState === "error" ? "!" : saveState === "saving" ? "…" : "✦"}</span>
        {message}
      </p>

      {activeView === "dig" ? (
        <div className="geo-dig-layout">
          <section className="geo-dig-panel" aria-labelledby="geo-dig-title">
            <div className="geo-section-heading">
              <div><small>DRILL WINDOW · 5 × 6</small><h2 id="geo-dig-title">未知地层</h2></div>
              <span>最浅顶部 {progress.board.baseDepth} m</span>
            </div>
            <div
              ref={gridWrapRef}
              className="geo-grid-wrap"
              onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setHammerPointer({
                  x: event.clientX - bounds.left,
                  y: event.clientY - bounds.top,
                });
              }}
              onPointerLeave={() => setHammerPointer(null)}
            >
              <div className="geo-grid" role="grid" aria-label="五列六行未知地层">
                {cellsInVisualOrder(progress.board.cells)
                  .map((cell) => {
                    const accessible = isCellAccessible(progress.board, cell);
                    const mineral = cell.mineralId ? itemById.get(cell.mineralId) : null;
                    const crackLevel = cell.status === "revealed"
                      ? Math.max(1, cell.totalHits - cell.hitsRemaining)
                      : 0;
                    return (
                      <button
                        className={[
                          "geo-cell",
                          `soil-${cell.soilVariant}`,
                          `is-${cell.status}`,
                          accessible ? "is-accessible" : "is-blocked",
                          crackLevel ? `crack-${crackLevel}` : "",
                        ].join(" ")}
                        type="button"
                        role="gridcell"
                        key={cell.id}
                        disabled={cell.status === "cleared" || saveState === "saving"}
                        onClick={(event) => handleStrike(cell.id, event.currentTarget)}
                        aria-label={
                          cell.status === "revealed"
                            ? `第 ${cell.depth} 米发现坚硬样本，继续敲击`
                            : accessible
                              ? `敲击第 ${cell.depth} 米地层`
                              : `第 ${cell.depth} 米地层，上方尚未挖开`
                        }
                      >
                        {cell.status === "revealed" && mineral && (
                          <img src={mineral.image.path} alt="" draggable={false} />
                        )}
                        <span className="geo-soil-grain" aria-hidden="true" />
                        {crackLevel > 0 && <span className="geo-cracks" aria-hidden="true" />}
                        <small>{cell.depth}m</small>
                      </button>
                    );
                  })}
              </div>
              <div className="geo-impact-layer" aria-hidden="true">
                {impactBursts.map((burst) => (
                  <span
                    className={`geo-impact-burst is-${burst.kind} is-soil-${burst.soilVariant}`}
                    key={burst.id}
                    style={{ left: burst.x, top: burst.y }}
                  >
                    {burst.fragments.map((fragment) => (
                      <i className="geo-impact-fragment" key={fragment.id} style={fragment.style}>
                        <b />
                      </i>
                    ))}
                  </span>
                ))}
              </div>
              {hammerPointer && (
                <span
                  className="geo-hammer-cursor"
                  data-swing={hammerSwing > 0 ? "true" : undefined}
                  key={hammerSwing}
                  style={{ left: hammerPointer.x, top: hammerPointer.y }}
                  aria-hidden="true"
                >
                  <i /><b />
                </span>
              )}
            </div>
            <p className="geo-grid-help">只敲每列最上方发光的格子。泥土不耗耐久，坚硬样本会逐渐出现裂纹。</p>
          </section>

          <aside className="geo-tool-panel">
            <section className="geo-tool-card">
              <div className="geo-hammer-illustration" aria-hidden="true"><i /><b /></div>
              <div><small>当前工具</small><h2>地质锤</h2><p>每次敲击坚硬样本消耗 1 点耐久。</p></div>
              <Meter
                value={(progress.currentHammerDurability / catalog.gameplay.hammer.durability) * 10}
                label={`${progress.currentHammerDurability} / ${catalog.gameplay.hammer.durability} 耐久`}
              />
            </section>

            <section className="geo-energy-card">
              <span className="geo-energy-symbol" aria-hidden="true">ϟ</span>
              <div><small>能量币</small><strong>{energyBalance ?? "…"}</strong><p>{energyError ?? `${catalog.gameplay.hammer.energyCoinCost} 枚购买 1 把地质锤`}</p></div>
              <button
                type="button"
                disabled={saveState === "saving" || energyBalance === null || energyBalance < catalog.gameplay.hammer.energyCoinCost}
                onClick={() => void handlePurchaseHammer()}
              >
                购买地质锤
              </button>
            </section>

            <button className={`geo-sound-toggle ${progress.soundEnabled ? "is-on" : ""}`} type="button" onClick={toggleSound}>
              <span aria-hidden="true">{progress.soundEnabled ? "♪" : "×"}</span>
              <span><strong>敲击音效</strong><small>{progress.soundEnabled ? "已打开 · 土壤与矿物声音不同" : "默认关闭 · 点击打开"}</small></span>
              <b>{progress.soundEnabled ? "开" : "关"}</b>
            </button>

            <section className="geo-recent">
              <div><h2>最近发现</h2><button type="button" onClick={() => setActiveView("catalog")}>打开图鉴 →</button></div>
              {progress.discoveredIds.length === 0 ? (
                <p className="geo-empty">还没有样本。选择一个发光格子，敲下第一锤吧！</p>
              ) : (
                <ul>
                  {progress.discoveredIds.slice(-4).reverse().map((id) => {
                    const item = itemById.get(id)!;
                    return (
                      <li key={id}>
                        <img src={item.image.path} alt="" />
                        <span><strong>{itemName(progress, item)}</strong><small>库存 {progress.inventory[id] ?? 0}</small></span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      ) : (
        <section className="geo-catalog" aria-labelledby="geo-catalog-title">
          <div className="geo-catalog-toolbar">
            <div><small>DISCOVERY ARCHIVE</small><h2 id="geo-catalog-title">发现图鉴</h2><p>只有挖到过的样本会出现在这里。研究一次，随机翻开一张属性卡。</p></div>
            <label>
              排序维度
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as CatalogSortKey)}>
                {SORT_LABELS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>
              {sortDirection === "asc" ? "↑ 正序" : "↓ 倒序"}
            </button>
          </div>

          {discoveredItems.length === 0 ? (
            <div className="geo-catalog-empty">
              <span aria-hidden="true">◇</span><h3>图鉴还是空的</h3><p>返回地层钻探，挖到第一份样本后，图片就会永久留在这里。</p>
              <button type="button" onClick={() => setActiveView("dig")}>去敲第一锤</button>
            </div>
          ) : (
            <div className="geo-catalog-layout">
              <div className="geo-table-wrap">
                <table>
                  <thead><tr><th>样本</th><th>类型</th><th>稀有度</th><th>硬度</th><th>价值</th><th>库存</th><th>研究</th></tr></thead>
                  <tbody>
                    {discoveredItems.map((item) => {
                      const unlocked = new Set(progress.unlockedAttributes[item.id] ?? []);
                      const completion = researchCompletion(progress, item.id);
                      return (
                        <tr className={selectedId === item.id ? "is-selected" : ""} key={item.id}>
                          <td>
                            <button type="button" onClick={() => setSelectedId(item.id)}>
                              <img src={item.image.path} alt="" />
                              <span><strong>{itemName(progress, item)}</strong><small>第 {progress.discoveredIds.indexOf(item.id) + 1} 个发现</small></span>
                            </button>
                          </td>
                          <td>{unlocked.has("classification") ? KIND_LABELS[item.kind] : "未知"}</td>
                          <td>{unlocked.has("rarity") ? `${item.rarity} / 10` : "未知"}</td>
                          <td>{unlocked.has("mohsHardness") ? item.mohsHardness.description.replace("代表性", "") : "未知"}</td>
                          <td>{unlocked.has("value") ? `${item.value.score} / 10` : "未知"}</td>
                          <td><b>{progress.inventory[item.id] ?? 0}</b> 份</td>
                          <td>
                            <span
                              className="geo-table-progress"
                              style={{ "--progress": `${completion * 100}%` } as CSSProperties}
                            >
                              {Math.round(completion * 100)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedItem && (
                <article className="geo-detail">
                  <div className="geo-detail-hero">
                    <img src={selectedItem.image.path} alt={isUnlocked(progress, selectedItem.id, "name") ? selectedItem.name : "已发现的未知样本"} />
                    <div><small>库存 {progress.inventory[selectedItem.id] ?? 0} 份</small><h3>{itemName(progress, selectedItem)}</h3><p>已解锁 {progress.unlockedAttributes[selectedItem.id]?.length ?? 0} / {RESEARCH_ATTRIBUTE_KEYS.length} 个词条</p></div>
                  </div>
                  <button
                    className="geo-research-button"
                    type="button"
                    disabled={
                      saveState === "saving"
                      || (progress.inventory[selectedItem.id] ?? 0) < 1
                      || remainingResearchAttributes(progress, selectedItem.id).length === 0
                      || (learningCoins?.coinBalance ?? 0) < catalog.gameplay.research.knowledgeCoinCost
                    }
                    onClick={() => void handleResearch(selectedItem)}
                  >
                    <span aria-hidden="true">✦</span>
                    <span><strong>研究一次</strong><small>消耗 5 知识币 + 1 份库存，随机解锁 1 个词条</small></span>
                  </button>
                  <div className="geo-attribute-grid">
                    {RESEARCH_ATTRIBUTE_KEYS.map((key) => {
                      const unlocked = isUnlocked(progress, selectedItem.id, key);
                      return (
                        <section className={`geo-attribute ${unlocked ? "is-unlocked" : "is-locked"} ${key === "safety" ? "is-safety" : ""}`} key={key}>
                          <header><span aria-hidden="true">{unlocked ? "✓" : "?"}</span><h4>{ATTRIBUTE_LABELS[key]}</h4></header>
                          <div>{unlocked ? attributeValue(selectedItem, key) : <p>这个词条还没有研究。</p>}</div>
                        </section>
                      );
                    })}
                  </div>
                  <p className="geo-editorial-note">稀有度和价值是儿童游戏中的相对分数，不是交易价格或投资建议。</p>
                </article>
              )}
            </div>
          )}
        </section>
      )}

      {discovery && (
        <div className="geo-discovery-flight" aria-live="polite">
          <span className="geo-fragment fragment-a" aria-hidden="true" />
          <span className="geo-fragment fragment-b" aria-hidden="true" />
          <span className="geo-fragment fragment-c" aria-hidden="true" />
          <img src={discovery.item.image.path} alt="" />
          <div><small>{discovery.first ? "全新发现" : "样本库存 +1"}</small><strong>{isUnlocked(progress, discovery.item.id, "name") ? discovery.item.name : "未知样本"}</strong></div>
        </div>
      )}
    </main>
  );
}
