import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  loadWorldTowerManifest,
  loadWorldTowerMap,
  loadWorldTowerNode,
  manageWorldTowerProgress,
  unlockWorldTowerNode,
  type WorldTowerProgressAction,
} from "./api";
import {
  activeLevelAtViewport,
  atlasCellPlacement,
  bottomAlignedScrollTop,
  frameQualityForLevel,
  initialWorldTowerTarget,
  layoutWorldTowerMap,
  traceWorldTowerRelations,
  visibleNodeName,
} from "./logic";
import type {
  WorldTowerManifest,
  WorldTowerMap,
  WorldTowerNode,
  WorldTowerNodeDetail,
} from "./types";
import "./world-tower.css";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "探索舱暂时没有回应，请稍后再试。";
}

function NodeArtwork({
  node,
  placeholderTexture,
}: {
  node: WorldTowerNode;
  placeholderTexture: string;
}) {
  if (!node.isUnlocked) {
    return <span className="mt-node-art is-mystery" aria-hidden="true">？</span>;
  }
  if (node.imagePath && node.imageCrop) {
    const placement = atlasCellPlacement(node.imageCrop);
    return (
      <span className="mt-node-art is-atlas" aria-hidden="true">
        <img
          src={node.imagePath}
          alt=""
          loading="lazy"
          style={{
            width: `${placement.widthPercent}%`,
            height: `${placement.heightPercent}%`,
            transform: `translate(${placement.translateXPercent}%, ${placement.translateYPercent}%)`,
          }}
        />
      </span>
    );
  }
  if (node.imagePath) {
    return <img className="mt-node-art" src={node.imagePath} alt="" loading="lazy" />;
  }
  return (
    <span
      className="mt-node-art is-placeholder"
      style={{ backgroundImage: `url("${placeholderTexture}")` }}
      aria-hidden="true"
    >
      <span>{node.name.slice(0, 4)}</span>
    </span>
  );
}

function MaterialNode({
  node,
  levelOrder,
  manifest,
  relation,
  onSelect,
  buttonRef,
}: {
  node: WorldTowerNode;
  levelOrder: number;
  manifest: WorldTowerManifest;
  relation: "normal" | "input" | "current" | "output";
  onSelect: (nodeId: string) => void;
  buttonRef: (element: HTMLButtonElement | null) => void;
}) {
  const quality = frameQualityForLevel(levelOrder);
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`mt-node is-${relation} ${node.isUnlocked ? "is-unlocked" : "is-locked"}`}
      onClick={() => onSelect(node.id)}
      aria-label={node.isUnlocked
        ? `${node.name}，已经点亮`
        : `未点亮的神秘节点，需要 ${node.unlockPriceCoins ?? 0} 知识币`}
    >
      <span className="mt-node__orb">
        <NodeArtwork node={node} placeholderTexture={manifest.placeholderTexture} />
        <img className="mt-node__frame" src={manifest.frames[quality]} alt="" aria-hidden="true" />
        <span className="mt-node__state" aria-hidden="true">{node.isUnlocked ? "✓" : "·"}</span>
      </span>
      <span className="mt-node__name">{visibleNodeName(node)}</span>
      <span className="mt-node__price">{node.isUnlocked ? "已点亮" : `✦ ${node.unlockPriceCoins ?? "—"}`}</span>
    </button>
  );
}

export function WorldTowerPage() {
  const [manifest, setManifest] = useState<WorldTowerManifest | null>(null);
  const [worldMap, setWorldMap] = useState<WorldTowerMap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorldTowerNodeDetail | null>(null);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(980);
  const [isViewportMeasured, setIsViewportMeasured] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [manageBusy, setManageBusy] = useState<WorldTowerProgressAction | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [fatalError, setFatalError] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const railButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const nodeButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const selectionRequestRef = useRef(0);
  const didInitialPositionRef = useRef(false);

  const refreshData = useCallback(async (signal?: AbortSignal) => {
    const [nextManifest, nextMap] = await Promise.all([
      loadWorldTowerManifest(signal),
      loadWorldTowerMap(signal),
    ]);
    setManifest(nextManifest);
    setWorldMap(nextMap);
    const bottomLevel = [...nextManifest.levels].sort((left, right) => right.order - left.order)[0];
    setActiveLevelId((current) => current ?? bottomLevel?.id ?? null);
    return { nextManifest, nextMap };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshData(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setFatalError(errorMessage(error));
    });
    return () => controller.abort();
  }, [refreshData]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateWidth = () => {
      setViewportWidth(Math.max(720, viewport.clientWidth - 24));
      setIsViewportMeasured(true);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [manifest]);

  const layout = useMemo(() => (
    manifest && worldMap
      ? layoutWorldTowerMap(worldMap.items, worldMap.edges, manifest.levels, viewportWidth)
      : null
  ), [manifest, viewportWidth, worldMap]);

  const relation = useMemo(() => (
    traceWorldTowerRelations(selectedId, worldMap?.edges ?? [])
  ), [selectedId, worldMap?.edges]);

  const nodeById = useMemo(() => new Map(
    (worldMap?.items ?? []).map((node) => [node.id, node]),
  ), [worldMap]);

  const levelById = useMemo(() => new Map(
    (manifest?.levels ?? []).map((level) => [level.id, level]),
  ), [manifest]);

  const selectNode = useCallback(async (nodeId: string) => {
    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    setSelectedId(nodeId);
    setDetail(null);
    try {
      const nextDetail = await loadWorldTowerNode(nodeId);
      if (selectionRequestRef.current === requestId) setDetail(nextDetail);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, []);

  useLayoutEffect(() => {
    if (
      didInitialPositionRef.current
      || !isViewportMeasured
      || !layout
      || !manifest
      || !worldMap
      || !viewportRef.current
    ) return;
    const target = initialWorldTowerTarget(worldMap.items, manifest.levels);
    const viewport = viewportRef.current;
    didInitialPositionRef.current = true;
    const previousScrollBehavior = viewport.style.scrollBehavior;
    viewport.style.scrollBehavior = "auto";
    viewport.scrollTop = bottomAlignedScrollTop(layout.height, viewport.clientHeight, zoom);
    viewport.style.scrollBehavior = previousScrollBehavior;
    setActiveLevelId(target.levelId);
    if (target.nodeId) {
      void selectNode(target.nodeId);
      nodeButtonsRef.current.get(target.nodeId)?.focus({ preventScroll: true });
    }
  }, [isViewportMeasured, layout, manifest, selectNode, worldMap, zoom]);

  useEffect(() => {
    if (!clearArmed) return;
    const timeout = window.setTimeout(() => setClearArmed(false), 5_000);
    return () => window.clearTimeout(timeout);
  }, [clearArmed]);

  const syncActiveLevel = useCallback(() => {
    if (!layout || !manifest || !viewportRef.current) return;
    const viewport = viewportRef.current;
    const next = activeLevelAtViewport(
      layout.bands,
      manifest.levels,
      viewport.scrollTop,
      viewport.clientHeight,
      zoom,
    );
    if (next) setActiveLevelId(next);
  }, [layout, manifest, zoom]);

  useEffect(() => {
    const activeButton = activeLevelId ? railButtonsRef.current.get(activeLevelId) : null;
    activeButton?.scrollIntoView({ block: "nearest" });
  }, [activeLevelId]);

  const goToLevel = (levelId: string) => {
    if (!layout || !viewportRef.current) return;
    const band = layout.bands.get(levelId);
    if (!band) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewportRef.current.scrollTo({
      top: Math.max(0, band.top * zoom - 8),
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setActiveLevelId(levelId);
  };

  const handleUnlock = async () => {
    if (!detail || detail.node.isUnlocked) return;
    setBusyTarget(detail.node.id);
    try {
      await unlockWorldTowerNode(detail.node.id);
      await refreshData();
      setDetail(await loadWorldTowerNode(detail.node.id));
      setNotice(`${detail.node.name}已经点亮，知识路线又向前一步！`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusyTarget(null);
    }
  };

  const handleManage = async (action: WorldTowerProgressAction) => {
    if (action === "clear-all" && !clearArmed) {
      setClearArmed(true);
      setNotice("再点一次“确认清空”，所有节点会回到未点亮状态，知识币余额会保留。");
      return;
    }
    setManageBusy(action);
    try {
      const result = await manageWorldTowerProgress(action);
      await refreshData();
      if (selectedId) setDetail(await loadWorldTowerNode(selectedId));
      setNotice(action === "unlock-all"
        ? `整座物质塔已点亮，共处理 ${result.affectedNodes} 个节点。`
        : `已经清空 ${result.affectedNodes} 个节点，知识币余额保持不变。`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setManageBusy(null);
      setClearArmed(false);
    }
  };

  if (fatalError) {
    return (
      <main className="mt-page mt-page--message">
        <section className="mt-message" role="alert">
          <span aria-hidden="true">◇</span>
          <h1>物质塔暂时没有打开</h1>
          <p>{fatalError}</p>
          <a href="/">返回学习大厅</a>
        </section>
      </main>
    );
  }

  if (!manifest || !worldMap || !layout) {
    return (
      <main className="mt-page mt-page--message" aria-live="polite">
        <section className="mt-message is-loading"><span aria-hidden="true">✦</span><h1>正在搭建物质塔…</h1></section>
      </main>
    );
  }

  const unlockedCount = manifest.progress.unlockedNodeIds.length;
  const currentLevel = levelById.get(activeLevelId ?? "");
  const recipe = detail?.node.recipes[0];
  const missingInputs = detail?.inputs.filter((input) => !input.isUnlocked) ?? [];
  const unlockPrice = detail?.node.unlockPriceCoins ?? 0;
  const canUnlock = Boolean(
    detail
    && !detail.node.isUnlocked
    && missingInputs.length === 0
    && manifest.progress.coinBalance >= unlockPrice,
  );
  const visibleEdges = selectedId
    ? worldMap.edges.filter((edge) => edge.sourceId === selectedId || edge.targetId === selectedId)
    : [];

  return (
    <main className="mt-page">
      <header className="mt-topbar">
        <a className="mt-back" href="/" aria-label="返回学习大厅">‹ <span>学习大厅</span></a>
        <div className="mt-title">
          <span className="mt-title__mark" aria-hidden="true">◇</span>
          <div><p>十六层知识构成图</p><h1>物质塔</h1></div>
        </div>
        <div className="mt-topbar__stats" aria-label="物质塔进度">
          <span><b>16</b> 层</span>
          <span><b>{unlockedCount}</b> / {manifest.counts.nodes} 已点亮</span>
          <span className="mt-coin"><i aria-hidden="true">✦</i><b>{manifest.progress.coinBalance}</b> 知识币</span>
        </div>
        <div className="mt-admin">
          <button type="button" disabled={manageBusy !== null} onClick={() => handleManage("unlock-all")}>
            {manageBusy === "unlock-all" ? "点亮中…" : "点亮全部"}
          </button>
          <button
            type="button"
            className={clearArmed ? "is-armed" : ""}
            disabled={manageBusy !== null}
            onClick={() => handleManage("clear-all")}
          >
            {manageBusy === "clear-all" ? "清空中…" : clearArmed ? "确认清空" : "清空进度"}
          </button>
        </div>
      </header>

      <div className="mt-workspace">
        <aside className="mt-level-rail" aria-label="物质塔层级导航">
          <div className="mt-level-rail__heading">
            <span>当前层级</span>
            <strong>{currentLevel?.name ?? "宇宙级"}</strong>
          </div>
          <nav>
            {[...manifest.levels].sort((left, right) => left.order - right.order).map((level) => {
              const active = level.id === activeLevelId;
              return (
                <button
                  key={level.id}
                  ref={(element) => {
                    if (element) railButtonsRef.current.set(level.id, element);
                    else railButtonsRef.current.delete(level.id);
                  }}
                  type="button"
                  className={active ? "is-active" : ""}
                  aria-current={active ? "location" : undefined}
                  onClick={() => goToLevel(level.id)}
                >
                  <span className="mt-level-rail__number">{String(level.order).padStart(2, "0")}</span>
                  <span className="mt-level-rail__name">{level.name}</span>
                  <span className="mt-level-rail__count">{worldMap.levelNodeCounts[level.id] ?? 0}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="mt-stage">
          <div className="mt-graph-pane">
            <div className="mt-toolbar">
              <div>
                <strong>{currentLevel?.name ?? "宇宙级"}</strong>
                <span>{currentLevel?.description}</span>
              </div>
              <div className="mt-zoom" aria-label="缩放物质塔">
                <button type="button" onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))} aria-label="缩小">−</button>
                <output>{Math.round(zoom * 100)}%</output>
                <button type="button" onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))} aria-label="放大">＋</button>
                <button
                  type="button"
                  className="mt-zoom__fit"
                  onClick={() => setZoom(Math.max(0.65, Math.min(1, (viewportRef.current?.clientWidth ?? 980) / layout.width)))}
                >适合宽度</button>
              </div>
            </div>

            <div className="mt-viewport" ref={viewportRef} onScroll={syncActiveLevel} tabIndex={0}>
              <div className="mt-scaled-space" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
                <div
                  className="mt-map"
                  style={{
                    width: layout.width,
                    height: layout.height,
                    transform: `scale(${zoom})`,
                  }}
                >
                  {manifest.levels.map((level) => {
                    const band = layout.bands.get(level.id)!;
                    return (
                      <section
                        key={level.id}
                        className={`mt-band mt-band--${(level.order - 1) % 4}`}
                        style={{ top: band.top, height: band.height }}
                        aria-label={`${level.name}，${worldMap.levelNodeCounts[level.id] ?? 0} 个节点`}
                      >
                        <header><b>{String(level.order).padStart(2, "0")}</b><span>{level.name}</span><small>{worldMap.levelNodeCounts[level.id] ?? 0} 个节点</small></header>
                      </section>
                    );
                  })}

                  <svg className="mt-relations" width={layout.width} height={layout.height} aria-hidden="true">
                    {visibleEdges.map((edge) => {
                      const source = layout.positions.get(edge.sourceId);
                      const target = layout.positions.get(edge.targetId);
                      if (!source || !target) return null;
                      const middleY = (source.y + target.y) / 2;
                      return (
                        <path
                          key={`${edge.recipeId}:${edge.sourceId}:${edge.targetId}`}
                          className={edge.targetId === selectedId ? "is-input" : "is-output"}
                          d={`M ${source.x} ${source.y} C ${source.x} ${middleY}, ${target.x} ${middleY}, ${target.x} ${target.y}`}
                        />
                      );
                    })}
                  </svg>

                  {worldMap.items.map((node) => {
                    const position = layout.positions.get(node.id);
                    const levelOrder = levelById.get(node.levelId)?.order ?? 16;
                    if (!position) return null;
                    const nodeRelation = node.id === selectedId
                      ? "current"
                      : relation.ancestors.has(node.id)
                        ? "input"
                        : relation.descendants.has(node.id)
                          ? "output"
                          : "normal";
                    return (
                      <div
                        key={node.id}
                        className="mt-node-position"
                        style={{ "--node-x": `${position.x}px`, "--node-y": `${position.y}px` } as CSSProperties}
                      >
                        <MaterialNode
                          node={node}
                          levelOrder={levelOrder}
                          manifest={manifest}
                          relation={nodeRelation}
                          onSelect={selectNode}
                          buttonRef={(element) => {
                            if (element) nodeButtonsRef.current.set(node.id, element);
                            else nodeButtonsRef.current.delete(node.id);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <aside className="mt-inspector" aria-label="节点构成详情" aria-live="polite">
            {detail ? (
              <>
                <div className="mt-inspector__eyebrow">
                  <span>{levelById.get(detail.node.levelId)?.name}</span>
                  <span className={detail.node.isUnlocked ? "is-unlocked" : ""}>{detail.node.isUnlocked ? "✓ 已点亮" : "尚未点亮"}</span>
                </div>
                <div className="mt-inspector__hero">
                  <NodeArtwork node={detail.node} placeholderTexture={manifest.placeholderTexture} />
                  <div>
                    <h2>{visibleNodeName(detail.node)}</h2>
                    <p>{detail.node.isUnlocked ? detail.node.summary : "点亮后，就能看到它的名字和图片。"}</p>
                  </div>
                </div>

                <section className="mt-knowledge-card">
                  <span>{detail.node.isUnlocked ? `知识关系 · ${recipe?.relationLabel ?? "直接认识"}` : "等待发现"}</span>
                  <strong>{detail.node.isUnlocked
                    ? recipe?.knowledgeTopic ?? "先认识基本粒子，再从它们出发探索万物。"
                    : "准备好前置节点，点亮后再揭开这里的知识。"}</strong>
                </section>

                <section className="mt-recipe">
                  <h3>{recipe ? `${recipe.relationLabel}路线` : "直接点亮"}</h3>
                  {detail.inputs.length > 0 ? (
                    <div className="mt-input-list">
                      {detail.inputs.map((input) => (
                        <button type="button" key={input.id} onClick={() => selectNode(input.id)} className={input.isUnlocked ? "is-ready" : ""}>
                          <span aria-hidden="true">{input.isUnlocked ? "✓" : "○"}</span>
                          <strong>{visibleNodeName(input)}</strong>
                          <small>{input.isUnlocked ? "已准备" : "需先点亮"}</small>
                        </button>
                      ))}
                    </div>
                  ) : <p className="mt-direct-note">这是探索的起点，不需要其他前置节点。</p>}
                </section>

                <button
                  type="button"
                  className="mt-unlock"
                  disabled={detail.node.isUnlocked || !canUnlock || busyTarget !== null}
                  onClick={handleUnlock}
                >
                  {busyTarget === detail.node.id
                    ? "正在点亮…"
                    : detail.node.isUnlocked
                      ? "✓ 已经点亮"
                      : missingInputs.length > 0
                        ? `还缺 ${missingInputs.length} 个前置节点`
                        : manifest.progress.coinBalance < unlockPrice
                          ? `还缺 ${unlockPrice - manifest.progress.coinBalance} 知识币`
                          : `点亮这个节点 · ✦ ${unlockPrice}`}
                </button>

                {detail.dependents.length > 0 && (
                  <section className="mt-next-list">
                    <h3>点亮后可以继续发现</h3>
                    <div>{detail.dependents.map((item) => (
                      <button type="button" key={item.id} onClick={() => selectNode(item.id)}>{visibleNodeName(item)}</button>
                    ))}</div>
                  </section>
                )}
              </>
            ) : (
              <div className="mt-inspector__empty">
                <span aria-hidden="true">◇</span>
                <h2>选择一个节点</h2>
                <p>所有节点都已经陈列在图上。点一下问号，准备好前置节点，就能逐步揭开它的名字和图片。</p>
                <ul>
                  <li><i className="is-input" /> 青色：它从哪里来</li>
                  <li><i className="is-output" /> 粉色：它还能通向哪里</li>
                </ul>
              </div>
            )}
          </aside>
        </section>
      </div>

      <div className={`mt-notice ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">
        {notice}
        {notice && <button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button>}
      </div>
    </main>
  );
}
