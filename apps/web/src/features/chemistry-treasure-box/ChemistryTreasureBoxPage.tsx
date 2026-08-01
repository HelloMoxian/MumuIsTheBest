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
  addTreasureAtom,
  buildTreasureBoxLibrary,
  findTreasureBoxMatch,
  indexTreasureDiscoveries,
  TREASURE_BOX_ELEMENT_LIMIT,
  TREASURE_BOX_FREE_ATOM_LIMIT,
  treasureAtomTotal,
} from "./logic";
import "../reaction-furnace/reaction-furnace.css";
import "./chemistry-treasure-box.css";

const TREASURE_ELEMENTS = ELEMENTS.slice(0, TREASURE_BOX_ELEMENT_LIMIT);
const TREASURE_SYMBOLS = new Set(TREASURE_ELEMENTS.map((element) => element.symbol));
const TREASURE_COMPOUNDS = buildTreasureBoxLibrary(
  REACTION_COMPOUNDS,
  TREASURE_SYMBOLS,
);
const MATCH_DELAY_MS = 520;

export function ChemistryTreasureBoxPage() {
  const [pool, setPool] = useState<AtomCounts>({});
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(new Set());
  const [discoveries, setDiscoveries] = useState<readonly ReactionCompound[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(TREASURE_ELEMENTS[0].symbol);
  const [assemblingId, setAssemblingId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("点击右侧元素，把第一个原子送进反应区。");

  const canvasRef = useRef<FurnaceCanvasHandle>(null);
  const poolRef = useRef<AtomCounts>({});
  const completedIdsRef = useRef(new Set<string>());
  const assemblingIdRef = useRef<string | null>(null);
  const matchTimerRef = useRef<number | null>(null);
  const tryAssemblyRef = useRef<() => void>(() => undefined);

  const freeAtomCount = treasureAtomTotal(pool);
  const discoveriesByElement = useMemo(
    () => indexTreasureDiscoveries(discoveries),
    [discoveries],
  );
  const selectedElement = TREASURE_ELEMENTS.find(
    (element) => element.symbol === selectedSymbol,
  ) ?? TREASURE_ELEMENTS[0];
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

  const scheduleMatch = useCallback((delay = MATCH_DELAY_MS) => {
    if (matchTimerRef.current !== null) window.clearTimeout(matchTimerRef.current);
    matchTimerRef.current = window.setTimeout(() => {
      matchTimerRef.current = null;
      tryAssemblyRef.current();
    }, delay);
  }, []);

  const tryAssembly = useCallback(() => {
    if (assemblingIdRef.current) return;
    const target = findTreasureBoxMatch(
      poolRef.current,
      TREASURE_COMPOUNDS,
      completedIdsRef.current,
    );
    if (!target) {
      if (treasureAtomTotal(poolRef.current) > 0) {
        setStatusText("这些原子正在做布朗运动，继续加入元素寻找新伙伴。");
      }
      return;
    }
    const started = canvasRef.current?.assemble(target, 0) ?? false;
    if (!started) {
      scheduleMatch(100);
      return;
    }
    poolRef.current = consumeAtomCounts(poolRef.current, target.atomCounts);
    setPool(poolRef.current);
    assemblingIdRef.current = target.id;
    setAssemblingId(target.id);
    setStatusText(`${target.formula} 的原子正在靠近，准备组成${target.name}。`);
  }, [scheduleMatch]);
  tryAssemblyRef.current = tryAssembly;

  const handleAssemblyComplete = useCallback((compound: ReactionCompound) => {
    completedIdsRef.current.add(compound.id);
    setCompletedIds(new Set(completedIdsRef.current));
    setDiscoveries((current) => [compound, ...current]);
    assemblingIdRef.current = null;
    setAssemblingId(null);
    setStatusText(`${compound.formula} ${compound.name}已经飘入百宝架，本次不会重复生成。`);
    scheduleMatch(260);
  }, [scheduleMatch]);

  const addElement = (symbol: string, chineseName: string) => {
    setSelectedSymbol(symbol);
    if (treasureAtomTotal(poolRef.current) >= TREASURE_BOX_FREE_ATOM_LIMIT) {
      setStatusText("反应区已经很热闹啦，先等原子组成物质，或清空游离原子。");
      return;
    }
    poolRef.current = addTreasureAtom(poolRef.current, symbol);
    setPool(poolRef.current);
    canvasRef.current?.addAtoms(symbol, 1);
    setStatusText(`${chineseName}原子已进入反应区，稍等一下看看它会遇见谁。`);
    scheduleMatch();
  };

  const removeDiscovery = (compound: ReactionCompound) => {
    completedIdsRef.current.delete(compound.id);
    setCompletedIds(new Set(completedIdsRef.current));
    setDiscoveries((current) => current.filter((item) => item.id !== compound.id));
    setStatusText(`${compound.formula} ${compound.name}已从百宝架移除，现在可以重新合成。`);
    scheduleMatch(120);
  };

  const clearFreeAtoms = () => {
    if (assemblingIdRef.current) return;
    poolRef.current = {};
    setPool({});
    canvasRef.current?.reset();
    setStatusText("游离原子已清空，百宝架上的发现仍然保留。");
  };

  const restart = () => {
    if (matchTimerRef.current !== null) window.clearTimeout(matchTimerRef.current);
    poolRef.current = {};
    completedIdsRef.current = new Set();
    assemblingIdRef.current = null;
    setPool({});
    setCompletedIds(new Set());
    setDiscoveries([]);
    setAssemblingId(null);
    setStatusText("新的百宝箱已经准备好，点击右侧元素开始探索。");
    canvasRef.current?.reset();
  };

  useEffect(() => () => {
    if (matchTimerRef.current !== null) window.clearTimeout(matchTimerRef.current);
  }, []);

  return (
    <div className="furnace-page treasure-page">
      <div className="furnace-stars" aria-hidden="true" />
      <header className="treasure-topbar">
        <a href="/" className="treasure-back" aria-label="返回学习大厅">← 大厅</a>
        <div className="treasure-title">
          <span aria-hidden="true">✦</span>
          <strong>化学百宝箱</strong>
          <small>自由投原子，收集新物质</small>
        </div>
        <div className="treasure-top-stats" aria-label="探索统计">
          <span><strong>{freeAtomCount}</strong> 游离原子</span>
          <span><strong>{discoveries.length}</strong> 种发现</span>
        </div>
        <div className="treasure-actions">
          <button type="button" onClick={clearFreeAtoms} disabled={freeAtomCount === 0 || Boolean(assemblingId)}>
            清空原子
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
                  <span className={assemblingId ? "reactor-status is-assembling" : "reactor-status"}>
                    <i aria-hidden="true" />
                    {assemblingId ? "正在组成新物质" : freeAtomCount ? "游离原子布朗运动中" : "反应区等待原子"}
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
                  onAssemblyComplete={handleAssemblyComplete}
                />
                {freeAtomCount === 0 && !assemblingId && (
                  <div className="treasure-empty">
                    <span aria-hidden="true">✦</span>
                    <strong>从右侧点一个元素</strong>
                    <p>连续点击可以投入多个原子，配方满足后会自动组成物质。</p>
                  </div>
                )}
                {poolEntries.length > 0 && (
                  <div className="treasure-pool-readout" aria-label="反应区游离原子">
                    {poolEntries.map(([symbol, count]) => (
                      <span key={symbol}><strong>{symbol}</strong> ×{count}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <section className="treasure-shelf" aria-labelledby="treasure-shelf-title">
              <header>
                <div>
                  <p>TREASURE SHELF</p>
                  <h2 id="treasure-shelf-title">反应生成物</h2>
                </div>
                <span>已收集 {completedIds.size} 种 · 最新生成的排在最上面</span>
              </header>
              {discoveries.length === 0 ? (
                <div className="treasure-shelf-empty">
                  <span aria-hidden="true">↓</span>
                  <p>生成物会从反应区落到这里。可以先试试两个氧原子。</p>
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
              按原子序数紧凑排列，每次点击投入 1 个原子。
            </p>
            <div className="treasure-periodic-scroll">
              <div className="treasure-periodic-grid">
                {TREASURE_ELEMENTS.map((element) => {
                  const theme = getReactionElementTheme(element.symbol);
                  const discoveryCount = discoveriesByElement[element.symbol]?.length ?? 0;
                  const freeCount = pool[element.symbol] ?? 0;
                  const isSelected = selectedSymbol === element.symbol;
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
                      aria-label={`投入1个${element.chineseName}原子并查看合成物，元素符号${element.symbol}，原子序数${element.atomicNumber}，已收集${discoveryCount}种，当前游离${freeCount}个`}
                      title={`${element.atomicNumber} · ${element.chineseName} · ${element.symbol} · 物 ${discoveryCount} · 原 ${freeCount}`}
                    >
                      <small className="treasure-element-number">{element.atomicNumber}</small>
                      <strong className="treasure-element-symbol">{element.symbol}</strong>
                      <span className="treasure-element-name">{element.chineseName}</span>
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
