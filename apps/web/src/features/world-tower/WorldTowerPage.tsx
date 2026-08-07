import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  loadWorldTowerLevelMap,
  loadWorldTowerManifest,
  loadWorldTowerMap,
  loadWorldTowerNode,
  manageWorldTowerProgress,
  purchaseWorldTowerResource,
  unlockWorldTowerNode,
  type WorldTowerProgressAction,
} from "./api";
import {
  atlasCellPlacement,
  buildResourceMap,
  frameQualityForLevel,
  hasRequirement,
  layoutWorldTowerMap,
  recipeRequirements,
  resourceCount,
  shouldDisplayRecipeRequirement,
  traceWorldTowerRelations,
  visibleNodeName,
} from "./logic";
import type {
  ResourceGroupKey,
  WorldTowerLevelMap,
  WorldTowerLoadStrategy,
  WorldTowerManifest,
  WorldTowerMap,
  WorldTowerMapEdge,
  WorldTowerNode,
  WorldTowerNodeDetail,
  WorldTowerProgress,
  WorldTowerResource,
} from "./types";
import "./world-tower.css";

const DISCOVERY_PHRASES = [
  "从最小的粒子，搭出最大的宇宙",
  "点亮万物之间看不见的来路",
  "从一束微光，发现山河与星海",
  "每一个为什么，都是新世界的入口",
  "看看桌椅、飞机和星球从哪里来",
] as const;

const RESOURCE_GROUPS: Array<{
  key: ResourceGroupKey;
  label: string;
  shortLabel: string;
}> = [
  { key: "particlePacks", label: "粒子包", shortLabel: "粒子包" },
  { key: "actions", label: "动作背包", shortLabel: "动作" },
  { key: "conditions", label: "成立条件", shortLabel: "条件" },
  { key: "environments", label: "环境场", shortLabel: "环境" },
  { key: "knowledge", label: "知识星图", shortLabel: "知识" },
];

const LOAD_STRATEGIES: Array<{
  value: WorldTowerLoadStrategy;
  label: string;
}> = [
  { value: "all", label: "全部加载" },
  { value: "locked", label: "加载未合成" },
  { value: "unlocked", label: "加载已合成" },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "探索舱暂时没有回应，请稍后再试。";
}

function NodeArtwork({
  node,
  className,
  placeholderTexture,
}: {
  node: WorldTowerNode;
  className: string;
  placeholderTexture: string;
}) {
  const crop = node.imageCrop;
  if (node.imagePath && crop) {
    const placement = atlasCellPlacement(crop);
    return (
      <span className={className + " wt-node-art is-atlas"} aria-hidden="true">
        <img
          className="wt-node-art__atlas-image"
          src={node.imagePath}
          alt=""
          loading="lazy"
          style={{
            width: placement.widthPercent + "%",
            height: placement.heightPercent + "%",
            transform: "translate(" + placement.translateXPercent + "%, "
              + placement.translateYPercent + "%)",
          }}
        />
      </span>
    );
  }
  if (node.imagePath) {
    return <img className={className + " wt-node-art"} src={node.imagePath} alt="" loading="lazy" />;
  }
  return (
    <span
      className={className + " wt-node-art is-semantic-placeholder"}
      style={{ backgroundImage: "url(\"" + placeholderTexture + "\")" }}
      aria-hidden="true"
    >
      {node.isUnlocked && (
        <span className="wt-node-art__placeholder-name">{node.name.slice(0, 5)}</span>
      )}
    </span>
  );
}

function RuneNode({
  node,
  levelOrder,
  frames,
  placeholderTexture,
  relation = "normal",
  onSelect,
}: {
  node: WorldTowerNode;
  levelOrder: number;
  frames: Record<string, string>;
  placeholderTexture: string;
  relation?: "normal" | "input" | "current" | "output";
  onSelect: (nodeId: string) => void;
}) {
  const quality = frameQualityForLevel(levelOrder);
  const label = visibleNodeName(node);

  return (
    <button
      className={[
        "wt-rune-node",
        "is-" + relation,
        node.isUnlocked ? "is-unlocked" : "is-locked",
      ].join(" ")}
      type="button"
      onClick={() => onSelect(node.id)}
      aria-label={
        node.isUnlocked
          ? "查看" + node.name + "的构成关系"
          : "未发现节点，需要" + (node.unlockPriceCoins ?? 0) + "知识币点亮"
      }
    >
      <span className="wt-rune-node__orb" aria-hidden="true">
        <NodeArtwork
          node={node}
          className="wt-rune-node__content"
          placeholderTexture={placeholderTexture}
        />
        {!node.isUnlocked && <span className="wt-rune-node__question">?</span>}
        <img className="wt-rune-node__frame" src={frames[quality]} alt="" />
      </span>
      <span className="wt-rune-node__label">{label}</span>
      {!node.isUnlocked && (
        <span className="wt-rune-node__price">
          <span aria-hidden="true">✦</span> {node.unlockPriceCoins ?? "—"}
        </span>
      )}
    </button>
  );
}

function ResourceSlot({
  resource,
  progress,
  active,
  onInspect,
}: {
  resource: WorldTowerResource;
  progress: WorldTowerProgress;
  active: boolean;
  onInspect: (resource: WorldTowerResource) => void;
}) {
  const count = resourceCount(resource, progress);
  const badge = count === "permanent"
    ? "✓"
    : count === "state"
      ? "◇"
      : resource.inventoryMode === "permanent-unlock"
        ? "·"
        : String(count);
  return (
    <button
      className={"wt-resource-slot" + (active ? " is-active" : "")}
      type="button"
      onMouseEnter={() => onInspect(resource)}
      onFocus={() => onInspect(resource)}
      onClick={() => onInspect(resource)}
      aria-label={
        resource.name + "，" + (
          count === "permanent"
            ? "已经学会"
            : count === "state"
              ? "过程状态"
              : resource.inventoryMode === "permanent-unlock"
                ? "尚未学会"
                : "现有" + count + "个"
        )
      }
    >
      {resource.imagePath
        ? <img src={resource.imagePath} alt="" loading="lazy" />
        : <span className="wt-resource-slot__fallback" aria-hidden="true">?</span>}
      <span className="wt-resource-slot__count" aria-hidden="true">{badge}</span>
    </button>
  );
}

function ReadinessMark({ ready }: { ready: boolean }) {
  return (
    <span
      className={"wt-readiness-mark " + (ready ? "is-ready" : "is-missing")}
      role="img"
      aria-label={ready ? "已具备" : "尚未具备"}
    >
      {ready ? "✓" : <span className="wt-readiness-mark__lock" aria-hidden="true" />}
    </span>
  );
}

function WorldTowerLoading() {
  return (
    <main className="wt-page is-loading" aria-live="polite">
      <div className="wt-loading-card">
        <span className="wt-loading-orbit" aria-hidden="true" />
        <strong>正在铺开万物星图…</strong>
        <span>把 15 个尺度接进同一张图里</span>
      </div>
    </main>
  );
}

function edgePath(
  edge: WorldTowerMapEdge,
  positions: ReadonlyMap<string, { x: number; y: number }>,
) {
  const source = positions.get(edge.sourceId);
  const target = positions.get(edge.targetId);
  if (!source || !target) return "";
  if (Math.abs(source.y - target.y) < 8) {
    const arch = 70 + Math.min(110, Math.abs(source.x - target.x) * 0.18);
    return "M " + source.x + " " + source.y
      + " C " + source.x + " " + (source.y - arch)
      + ", " + target.x + " " + (target.y - arch)
      + ", " + target.x + " " + target.y;
  }
  const sourceY = source.y - 42;
  const targetY = target.y + 42;
  const curve = Math.max(65, Math.abs(sourceY - targetY) * 0.42);
  return "M " + source.x + " " + sourceY
    + " C " + source.x + " " + (sourceY - curve)
    + ", " + target.x + " " + (targetY + curve)
    + ", " + target.x + " " + targetY;
}

export function WorldTowerPage() {
  const [manifest, setManifest] = useState<WorldTowerManifest | null>(null);
  const [worldMap, setWorldMap] = useState<WorldTowerMap | null>(null);
  const [levelMap, setLevelMap] = useState<WorldTowerLevelMap | null>(null);
  const [expandedLevelId, setExpandedLevelId] = useState<string | null>(null);
  const [loadStrategy, setLoadStrategy] = useState<WorldTowerLoadStrategy>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorldTowerNodeDetail | null>(null);
  const [activeResource, setActiveResource] = useState<WorldTowerResource | null>(null);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [clearAllArmed, setClearAllArmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [levelLoading, setLevelLoading] = useState(false);
  const [zoom, setZoom] = useState(0.84);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [previewNode, setPreviewNode] = useState<WorldTowerNode | null>(null);
  const [phrase] = useState(
    () => DISCOVERY_PHRASES[Math.floor(Math.random() * DISCOVERY_PHRASES.length)],
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const previewCloseRef = useRef<HTMLButtonElement | null>(null);
  const previewReturnFocusRef = useRef<HTMLElement | null>(null);
  const centeredOnceRef = useRef(false);
  const focusedExpansionRef = useRef("");
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      loadWorldTowerManifest(controller.signal),
      loadWorldTowerMap(controller.signal),
    ])
      .then(([nextManifest, nextMap]) => {
        setManifest(nextManifest);
        setWorldMap(nextMap);
        setActiveResource(nextManifest.resources.actions[0] ?? null);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setFatalError(errorMessage(error));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!expandedLevelId) {
      setLevelMap(null);
      return;
    }
    const controller = new AbortController();
    setLevelMap(null);
    setLevelLoading(true);
    loadWorldTowerLevelMap(expandedLevelId, loadStrategy, controller.signal)
      .then((nextLevelMap) => {
        setLevelMap(nextLevelMap);
        setNotice("");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setNotice(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLevelLoading(false);
      });
    return () => controller.abort();
  }, [expandedLevelId, loadStrategy]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    loadWorldTowerNode(selectedId, controller.signal)
      .then(setDetail)
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setNotice(errorMessage(error));
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => {
    if (!clearAllArmed) return undefined;
    const timeout = window.setTimeout(() => setClearAllArmed(false), 5_000);
    return () => window.clearTimeout(timeout);
  }, [clearAllArmed]);

  useEffect(() => {
    if (!previewNode) return undefined;
    previewCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeArtworkPreview();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [previewNode]);

  useEffect(() => {
    if (!manifest || !worldMap) return undefined;
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => setViewportWidth(viewport.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [manifest?.graphId, worldMap?.graphId]);

  const displayedMap = useMemo(() => {
    if (!worldMap || !levelMap) return worldMap;
    return {
      ...worldMap,
      items: [
        ...worldMap.items.filter((node) => node.levelId !== levelMap.levelId),
        ...levelMap.items,
      ],
      edges: levelMap.edges,
      levelNodeCounts: {
        ...worldMap.levelNodeCounts,
        [levelMap.levelId]: levelMap.matchedTotal,
      },
    };
  }, [worldMap, levelMap]);
  const layout = useMemo(
    () => (
      manifest && displayedMap
        ? layoutWorldTowerMap(
            displayedMap.items,
            displayedMap.edges,
            manifest.levels,
            levelMap
              ? { levelId: levelMap.levelId, groups: levelMap.groups }
              : null,
            viewportWidth > 0
              ? viewportWidth / zoom + (selectedId ? 360 : 0)
              : undefined,
          )
        : null
    ),
    [manifest, displayedMap, levelMap, viewportWidth, zoom, selectedId],
  );
  const relations = useMemo(
    () => traceWorldTowerRelations(selectedId, displayedMap?.edges ?? []),
    [selectedId, displayedMap],
  );
  const visibleRelationEdges = useMemo(
    () => selectedId && displayedMap
      ? displayedMap.edges.filter((edge) => (
          edge.sourceId === selectedId || edge.targetId === selectedId
        ))
      : [],
    [selectedId, displayedMap],
  );
  const resourceById = useMemo(
    () => manifest ? buildResourceMap(manifest) : new Map<string, WorldTowerResource>(),
    [manifest],
  );
  const selectedNode = detail?.node
    ?? displayedMap?.items.find((node) => node.id === selectedId)
    ?? null;
  const selectedRecipe = detail?.node.recipes[0];
  const allRequirements = useMemo(
    () => recipeRequirements(selectedRecipe, resourceById),
    [selectedRecipe, resourceById],
  );
  const missingInputs = detail?.inputs.filter((node) => !node.isUnlocked) ?? [];
  const missingInputCount = missingInputs.length;
  const missingResources = manifest
    ? allRequirements.filter(({ requirement, resource }) => (
        resource ? !hasRequirement(resource, requirement, manifest.progress) : true
      ))
    : [];
  const missingResourceIds = new Set(
    missingResources.map(({ requirement }) => requirement.resourceId),
  );
  const displayRequirements = manifest
    ? allRequirements.filter(({ group, requirement, resource }) => (
        shouldDisplayRecipeRequirement(group, requirement, resource, manifest.progress)
      ))
    : [];
  const orderedRequirements = [
    ...missingResources,
    ...displayRequirements.filter(({ requirement }) => !missingResourceIds.has(requirement.resourceId)),
  ];
  const visibleMissingInputs = missingInputs.slice(0, 4);
  const visibleRequirements = orderedRequirements.slice(0, 4 - visibleMissingInputs.length);
  const canUnlock = Boolean(
    manifest
    && selectedNode
    && detail
    && !selectedNode.isUnlocked
    && missingInputCount === 0
    && missingResources.length === 0
    && manifest.progress.coinBalance >= (selectedNode.unlockPriceCoins ?? Number.POSITIVE_INFINITY),
  );

  function focusAt(x: number, y: number, behavior: ScrollBehavior = "smooth") {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      left: Math.max(0, x * zoom - viewport.clientWidth / 2),
      top: Math.max(0, y * zoom - viewport.clientHeight / 2),
      behavior,
    });
  }

  function focusNode(nodeId: string, behavior: ScrollBehavior = "smooth") {
    const position = layout?.positions.get(nodeId);
    if (position) focusAt(position.x, position.y, behavior);
  }

  useEffect(() => {
    if (!layout || !selectedId || centeredOnceRef.current) return;
    centeredOnceRef.current = true;
    requestAnimationFrame(() => focusNode(selectedId, "auto"));
  }, [layout, selectedId]);

  useEffect(() => {
    if (!layout || !levelMap) return;
    const focusKey = levelMap.levelId + ":" + levelMap.visibility;
    if (focusedExpansionRef.current === focusKey) return;
    const band = layout.bands.get(levelMap.levelId);
    if (!band) return;
    focusedExpansionRef.current = focusKey;
    requestAnimationFrame(() => focusAt(layout.width / 2, band.top + 190));
  }, [layout, levelMap]);

  function chooseNode(nodeId: string) {
    setSelectedId(nodeId);
    setNotice("");
    requestAnimationFrame(() => focusNode(nodeId));
  }

  function chooseLevel(levelId: string) {
    if (!layout) return;
    if (expandedLevelId === levelId && levelMap) {
      const band = layout.bands.get(levelId);
      if (band) focusAt(layout.width / 2, band.top + 190);
      return;
    }
    focusedExpansionRef.current = "";
    setExpandedLevelId(levelId);
    setNotice("正在按“" + (LOAD_STRATEGIES.find((item) => item.value === loadStrategy)?.label ?? "全部加载") + "”展开这个尺度层…");
  }

  function chooseLoadStrategy(strategy: WorldTowerLoadStrategy) {
    focusedExpansionRef.current = "";
    setLoadStrategy(strategy);
    if (!expandedLevelId) {
      setExpandedLevelId(selectedNode?.levelId ?? manifest?.levels[0]?.id ?? null);
    }
  }

  function changeZoom(nextZoom: number) {
    const viewport = viewportRef.current;
    const next = Math.max(0.62, Math.min(1.16, nextZoom));
    if (!viewport) {
      setZoom(next);
      return;
    }
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / zoom;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / zoom;
    setZoom(next);
    requestAnimationFrame(() => {
      viewport.scrollTo({
        left: centerX * next - viewport.clientWidth / 2,
        top: centerY * next - viewport.clientHeight / 2,
        behavior: "auto",
      });
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest("button, a")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-panning");
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !viewport) return;
    viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
    viewport.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
  }

  function endPointerPan(
    event: ReactPointerEvent<HTMLDivElement>,
    clearSelectionOnClick = false,
  ) {
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const isBlankClick = clearSelectionOnClick
        && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7
        && !(event.target as Element).closest("button, a");
      dragRef.current = null;
      if (isBlankClick) {
        setSelectedId(null);
        setNotice("");
      }
    }
    viewport?.classList.remove("is-panning");
  }

  function updateProgress(progress: WorldTowerProgress) {
    setManifest((current) => current ? { ...current, progress } : current);
  }

  function openArtworkPreview(node: WorldTowerNode) {
    if (!node.isUnlocked || !node.imagePath) return;
    previewReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPreviewNode(node);
  }

  function closeArtworkPreview() {
    setPreviewNode(null);
    requestAnimationFrame(() => previewReturnFocusRef.current?.focus());
  }

  async function refreshProgressViews(progress: WorldTowerProgress) {
    updateProgress(progress);
    const [nextWorldMap, nextLevelMap, nextDetail] = await Promise.all([
      loadWorldTowerMap(),
      expandedLevelId
        ? loadWorldTowerLevelMap(expandedLevelId, loadStrategy)
        : Promise.resolve(null),
      selectedId ? loadWorldTowerNode(selectedId) : Promise.resolve(null),
    ]);
    setWorldMap(nextWorldMap);
    setLevelMap(nextLevelMap);
    setDetail(nextDetail);
  }

  async function handleProgressAction(action: WorldTowerProgressAction) {
    if (busyTarget) return;
    if (action === "clear-all" && !clearAllArmed) {
      setClearAllArmed(true);
      setNotice("清空会保留知识币，但会移除所有发现、知识和背包道具。请在 5 秒内再点一次确认。");
      return;
    }
    setClearAllArmed(false);
    setBusyTarget("progress:" + action);
    setNotice(
      action === "unlock-all"
        ? "正在点亮整座万物构成塔…"
        : "正在安全清空发现与背包…",
    );
    try {
      const result = await manageWorldTowerProgress(action);
      await refreshProgressViews(result.progress);
      setNotice(
        action === "unlock-all"
          ? "全部 2,000 个节点已经点亮。"
          : "已经清空，电子、质子和中子三个起点仍然保留。",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusyTarget(null);
    }
  }

  async function handleUnlock() {
    if (!detail || detail.node.isUnlocked || busyTarget) return;
    if (!canUnlock) {
      setNotice("先沿着青色来路点亮输入，再把右侧缺少的动作或知识准备好。");
      return;
    }
    setBusyTarget(detail.node.id);
    setNotice("正在把这次发现安全地写入本机进度…");
    try {
      const result = await unlockWorldTowerNode(detail.node.id);
      updateProgress(result.progress);
      setWorldMap((current) => current ? {
        ...current,
        items: current.items.map((node) => (
          node.id === detail.node.id ? { ...node, isUnlocked: true } : node
        )),
      } : current);
      setLevelMap((current) => {
        if (!current || current.levelId !== detail.node.levelId) return current;
        const unlockedItems = current.items.map((node) => (
          node.id === detail.node.id ? { ...node, isUnlocked: true } : node
        ));
        const keepNode = current.visibility !== "locked";
        return {
          ...current,
          matchedTotal: keepNode ? current.matchedTotal : current.matchedTotal - 1,
          items: keepNode
            ? unlockedItems
            : unlockedItems.filter((node) => node.id !== detail.node.id),
          groups: current.groups
            .map((group) => ({
              ...group,
              nodeIds: keepNode
                ? group.nodeIds
                : group.nodeIds.filter((nodeId) => nodeId !== detail.node.id),
            }))
            .filter((group) => group.nodeIds.length > 0),
        };
      });
      setDetail((current) => current ? {
        ...current,
        node: { ...current.node, isUnlocked: true },
      } : current);
      setNotice(result.alreadyUnlocked ? "这个发现已经亮着了。" : "发现成功！它已经永久点亮。");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusyTarget(null);
    }
  }

  async function handlePurchase(resource: WorldTowerResource) {
    if (!resource.shop.purchasable || busyTarget) return;
    setBusyTarget(resource.id);
    setNotice("正在准备“" + resource.name + "”…");
    try {
      const result = await purchaseWorldTowerResource(resource.id);
      updateProgress(result.progress);
      setNotice(
        result.alreadyUnlocked
          ? "“" + resource.name + "”已经永久点亮。"
          : resource.inventoryMode === "charge"
            ? "背包里增加了一个“" + resource.name + "”。"
            : "“" + resource.name + "”已经永久点亮。",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusyTarget(null);
    }
  }

  if (fatalError) {
    return (
      <main className="wt-page is-loading">
        <div className="wt-loading-card is-error">
          <strong>万物星图暂时没有展开</strong>
          <span>{fatalError}</span>
          <button type="button" onClick={() => window.location.reload()}>再试一次</button>
          <a href="/">返回学习岛</a>
        </div>
      </main>
    );
  }
  if (!manifest || !worldMap || !displayedMap || !layout) return <WorldTowerLoading />;

  const selectedLevelOrder = selectedNode
    ? manifest.levels.find((level) => level.id === selectedNode.levelId)?.order ?? 1
    : 1;
  const selectedLabel = selectedNode ? visibleNodeName(selectedNode) : "还没有选择";
  const backgroundStyle = {
    "--wt-background": "url(\"" + manifest.backgroundAsset + "\")",
  } as CSSProperties;
  const scalerStyle = {
    width: layout.width * zoom,
    height: layout.height * zoom,
  };
  const surfaceStyle = {
    width: layout.width,
    height: layout.height,
    transform: "scale(" + zoom + ")",
  };

  return (
    <main className="wt-page" style={backgroundStyle}>
      <header className="wt-topbar">
        <a className="wt-back" href="/" aria-label="返回学习岛">← <span>学习岛</span></a>
        <div className="wt-title">
          <span className="wt-title__mark" aria-hidden="true">✦</span>
          <div>
            <h1>万物构成塔</h1>
            <p>{phrase}</p>
          </div>
        </div>
        <div className="wt-topbar__stats">
          <div className="wt-progress-actions" role="group" aria-label="进度快捷操作">
            <button
              className="is-unlock-all"
              type="button"
              disabled={busyTarget !== null}
              onClick={() => handleProgressAction("unlock-all")}
            >
              {busyTarget === "progress:unlock-all" ? "点亮中…" : "点亮全部"}
            </button>
            <button
              className={"is-clear-all" + (clearAllArmed ? " is-armed" : "")}
              type="button"
              disabled={busyTarget !== null}
              aria-pressed={clearAllArmed}
              onClick={() => handleProgressAction("clear-all")}
            >
              {busyTarget === "progress:clear-all"
                ? "清空中…"
                : clearAllArmed ? "再点确认" : "清空全部"}
            </button>
          </div>
          <span className="wt-discovery-count"><b>{manifest.counts.nodes.toLocaleString("zh-CN")}</b> 个发现</span>
          <span className="wt-coin"><i aria-hidden="true">✦</i> <b>{manifest.progress.coinBalance.toLocaleString("zh-CN")}</b> 知识币</span>
        </div>
      </header>

      <div className="wt-graph-layout">
        <section className="wt-graph-stage" aria-label="从粒子到宇宙的万物关系图">
          <div className="wt-graph-toolbar">
            <div className="wt-graph-toolbar__summary">
              <span>{levelLoading ? "正在展开尺度层" : levelMap ? "已展开尺度层" : "全塔关系骨架"}</span>
              <b>
                {levelMap
                  ? (manifest.levels.find((level) => level.id === levelMap.levelId)?.name ?? "尺度层")
                    + " · " + levelMap.matchedTotal + " / " + levelMap.totalInLevel
                  : displayedMap.items.length + " 个节点 · " + (selectedId ? "显示一跳关系" : "暂不显示连线")}
              </b>
              <small>{levelMap ? levelMap.groups.length + " 个二级组，每行最多 6 个" : "点节点才显示上下各一层关系"}</small>
            </div>
            <div className="wt-load-strategy" role="group" aria-label="尺度层加载策略">
              {LOAD_STRATEGIES.map((strategy) => (
                <button
                  className={strategy.value === loadStrategy ? "is-active" : ""}
                  key={strategy.value}
                  type="button"
                  aria-pressed={strategy.value === loadStrategy}
                  onClick={() => chooseLoadStrategy(strategy.value)}
                >
                  {strategy.label}
                </button>
              ))}
            </div>
            <div className="wt-graph-toolbar__legend" aria-label="关系高亮图例">
              <span className="is-input">来路</span>
              <span className="is-current">当前</span>
              <span className="is-output">去向</span>
            </div>
            <div className="wt-graph-toolbar__controls" aria-label="图谱缩放与定位">
              <button type="button" onClick={() => changeZoom(zoom - 0.1)} aria-label="缩小图谱">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => changeZoom(zoom + 0.1)} aria-label="放大图谱">＋</button>
              <button
                className="is-labeled"
                type="button"
                disabled={!selectedId}
                onClick={() => selectedId && focusNode(selectedId)}
              >
                ◎ 定位当前
              </button>
            </div>
          </div>
          {levelLoading && (
            <div className="wt-level-map-loading" aria-live="polite">
              <span />
              正在整理这个尺度层…
            </div>
          )}

          <div
            className="wt-graph-viewport"
            ref={viewportRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => endPointerPan(event, true)}
            onPointerCancel={(event) => endPointerPan(event)}
          >
            <div className="wt-graph-scaler" style={scalerStyle}>
              <div className="wt-graph-surface" style={surfaceStyle}>
                {[...manifest.levels].sort((left, right) => right.order - left.order).map((level) => {
                  const band = layout.bands.get(level.id);
                  if (!band) return null;
                  const isExpanded = expandedLevelId === level.id;
                  return (
                    <section
                      className={"wt-world-band" + (isExpanded ? " is-expanded" : "")}
                      key={level.id}
                      style={{ top: band.top, height: band.height }}
                      aria-label={"第" + level.order + "层：" + level.name}
                    >
                      <span className="wt-world-band__watermark" aria-hidden="true">
                        {String(level.order).padStart(2, "0")} · {level.name}
                      </span>
                      <button
                        className="wt-world-band__label"
                        type="button"
                        onClick={() => chooseLevel(level.id)}
                        title={level.description}
                      >
                        <img src={level.imagePath} alt="" loading="lazy" />
                        <span>
                          <small>{String(level.order).padStart(2, "0")} · 尺度层</small>
                          <b>{level.name}</b>
                          <i>
                            {isExpanded
                              ? levelLoading
                                ? "正在加载完整内容…"
                                : "已加载 " + (levelMap?.matchedTotal ?? 0) + " / " + (manifest.counts.levelCounts[level.id] ?? 0)
                              : "图上 " + (worldMap.levelNodeCounts[level.id] ?? 0)
                                + " / 共 " + (manifest.counts.levelCounts[level.id] ?? 0)
                                + " · 点击展开"}
                          </i>
                        </span>
                      </button>
                    </section>
                  );
                })}

                {layout.groupLayouts.map((group) => (
                  <section
                    className="wt-world-subgroup"
                    key={group.id}
                    style={{ top: group.top, height: group.height }}
                    aria-label={group.name + "，" + group.nodeCount + "个节点"}
                  >
                    <header>
                      <span>二级组</span>
                      <b>{group.name}</b>
                      <i>{group.nodeCount} 个 · 每行最多 6 个</i>
                    </header>
                  </section>
                ))}

                <svg
                  className="wt-world-edges"
                  viewBox={"0 0 " + layout.width + " " + layout.height}
                  aria-hidden="true"
                >
                  <defs>
                    <marker id="wt-arrow-input" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" />
                    </marker>
                    <marker id="wt-arrow-output" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" />
                    </marker>
                  </defs>
                  {visibleRelationEdges.map((edge) => {
                    const edgeRelation = edge.targetId === selectedId ? "input" : "output";
                    return (
                      <path
                        key={edge.sourceId + ":" + edge.targetId}
                        className={"is-" + edgeRelation}
                        d={edgePath(edge, layout.positions)}
                        markerEnd={"url(#wt-arrow-" + edgeRelation + ")"}
                      />
                    );
                  })}
                </svg>

                {displayedMap.items.map((node) => {
                  const position = layout.positions.get(node.id);
                  if (!position) return null;
                  const relation = node.id === selectedId
                    ? "current"
                    : relations.ancestors.has(node.id)
                      ? "input"
                      : relations.descendants.has(node.id)
                        ? "output"
                        : "normal";
                  const levelOrder = manifest.levels.find((level) => level.id === node.levelId)?.order ?? 1;
                  return (
                    <div
                      className={[
                        "wt-map-node",
                        "is-" + relation,
                        node.id === selectedId ? "is-selected" : "",
                      ].join(" ")}
                      key={node.id}
                      style={{ left: position.x, top: position.y }}
                    >
                      <span className="wt-map-node__relation" aria-hidden="true">
                        {relation === "current"
                          ? "当前"
                          : relation === "input"
                            ? "来路"
                            : relation === "output"
                              ? "去向"
                              : ""}
                      </span>
                      <RuneNode
                        node={node}
                        levelOrder={levelOrder}
                        frames={manifest.frames}
                        placeholderTexture={manifest.placeholderTexture}
                        relation={relation}
                        onSelect={chooseNode}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {selectedNode && (
            <section
              className={"wt-graph-inspector" + (selectedNode.isUnlocked ? " is-unlocked" : "")}
              aria-live="polite"
            >
              <button
                className={"wt-graph-inspector__art" + (selectedNode.isUnlocked ? "" : " is-locked")}
                type="button"
                disabled={!selectedNode.isUnlocked || !selectedNode.imagePath}
                onClick={() => openArtworkPreview(selectedNode)}
                aria-label={selectedNode.isUnlocked && selectedNode.imagePath
                  ? "放大查看" + selectedNode.name + "的精细图片"
                  : undefined}
              >
                <NodeArtwork
                  node={selectedNode}
                  className="wt-graph-inspector__image"
                  placeholderTexture={manifest.placeholderTexture}
                />
                {!selectedNode.isUnlocked && (
                  <span className="wt-graph-inspector__question" aria-hidden="true">?</span>
                )}
                {selectedNode.isUnlocked && selectedNode.imagePath && (
                  <span className="wt-graph-inspector__zoom-hint" aria-hidden="true">
                    查看大图
                  </span>
                )}
              </button>
              <div className="wt-graph-inspector__body">
                <div className="wt-graph-inspector__copy">
                  <span>
                    第 {selectedLevelOrder} 层 ·
                    {" "}{detailLoading ? "正在连接来路…" : "来路 " + (detail?.inputs.length ?? 0) + " · 去向 " + (detail?.dependents.length ?? 0)}
                  </span>
                  <div>
                    <h2>{selectedLabel}</h2>
                    <p>
                      {selectedNode.isUnlocked
                        ? selectedNode.summary
                        : "把来路、动作与知识准备齐，就能点亮这个发现。"}
                    </p>
                  </div>
                </div>
                <div className="wt-graph-inspector__formula">
                  <span>合成公式</span>
                  <div className="wt-formula-flow">
                    {detailLoading ? (
                      <p>正在整理构成关系…</p>
                    ) : selectedRecipe ? (
                      <>
                        <div className="wt-formula-steps">
                          {(detail?.inputs.length ?? 0) > 0 && (
                            <div className="wt-formula-section is-inputs">
                              <span className="wt-formula-section__label">组成节点</span>
                              <div className="wt-formula-terms">
                                {detail?.inputs.map((inputNode) => (
                                  <button
                                    className={"wt-formula-term is-node" + (inputNode.isUnlocked ? " is-ready" : " is-locked")}
                                    key={inputNode.id}
                                    type="button"
                                    onClick={() => chooseNode(inputNode.id)}
                                  >
                                    <NodeArtwork
                                      node={inputNode}
                                      className="wt-formula-term__art"
                                      placeholderTexture={manifest.placeholderTexture}
                                    />
                                    <span>
                                      <b>{visibleNodeName(inputNode)}</b>
                                      <small className="wt-formula-term__meta">
                                        <span>来路</span>
                                        <ReadinessMark ready={inputNode.isUnlocked} />
                                      </small>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {displayRequirements.length > 0 && (
                            <div className="wt-formula-section is-requirements">
                              <span className="wt-formula-section__label">过程准备</span>
                              <div className="wt-formula-terms">
                                {displayRequirements.map(({ group, requirement, resource }) => {
                                  if (!resource) return null;
                                  const ready = hasRequirement(resource, requirement, manifest.progress);
                                  return (
                                    <button
                                      className={"wt-formula-term is-resource" + (ready ? " is-ready" : " is-missing")}
                                      key={resource.id}
                                      type="button"
                                      onClick={() => setActiveResource(resource)}
                                    >
                                      {resource.imagePath && <img src={resource.imagePath} alt="" />}
                                      <span>
                                        <b>{resource.name}{requirement.amount > 1 ? " ×" + requirement.amount : ""}</b>
                                        <small className="wt-formula-term__meta">
                                          <span>{RESOURCE_GROUPS.find((item) => item.key === group)?.shortLabel ?? "准备"}</span>
                                          <ReadinessMark ready={ready} />
                                        </small>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {(detail?.inputs.length ?? 0) === 0 && displayRequirements.length === 0 && (
                            <span className="wt-formula-origin">探索起点</span>
                          )}
                        </div>
                        <span className="wt-formula-arrow" aria-hidden="true">→</span>
                        <strong className="wt-formula-result">{selectedLabel}</strong>
                      </>
                    ) : (
                      <p>这是探索起点，不需要额外的构成材料。</p>
                    )}
                  </div>
                </div>
              </div>
              {!selectedNode.isUnlocked && (
                <div className="wt-graph-inspector__action">
                  <button
                    className="wt-unlock-button"
                    type="button"
                    disabled={!canUnlock || busyTarget !== null}
                    onClick={handleUnlock}
                  >
                    {busyTarget === selectedNode.id
                      ? "正在保存…"
                      : <>点亮节点 <span>✦ {selectedNode.unlockPriceCoins ?? "—"}</span></>}
                  </button>
                  <small>
                    {missingInputCount > 0
                      ? "还缺 " + missingInputCount + " 个来路节点"
                      : missingResources.length > 0
                        ? "还缺 " + missingResources.length + " 项准备"
                        : manifest.progress.coinBalance < (selectedNode.unlockPriceCoins ?? 0)
                          ? "知识币还不够"
                          : "已经可以点亮"}
                  </small>
                </div>
              )}
            </section>
          )}
        </section>

        <aside className="wt-backpack" aria-label="粒子包、动作、条件、环境和知识背包">
          <header>
            <div>
              <span>探索工具箱</span>
              <h2>星格背包</h2>
            </div>
            <span className="wt-backpack__capacity">{manifest.counts.resources} 种</span>
          </header>

          <section className="wt-needed-dock" aria-label="当前节点的构成准备">
            <header>
              <div>
                <span>当前构成需要</span>
                <h3>{selectedLabel}</h3>
              </div>
              {missingInputCount > 0 && <b>缺 {missingInputCount} 个来路</b>}
            </header>
            <div className="wt-needed-dock__items">
              {visibleMissingInputs.map((inputNode) => (
                <div className="wt-needed-item is-node is-missing" key={inputNode.id}>
                  <button type="button" onClick={() => chooseNode(inputNode.id)}>
                    <NodeArtwork
                      node={inputNode}
                      className="wt-requirement-card__node-art"
                      placeholderTexture={manifest.placeholderTexture}
                    />
                    <span>
                      <b>{visibleNodeName(inputNode)}</b>
                      <small className="wt-needed-item__state">
                        <ReadinessMark ready={false} />
                        <span>点击前往</span>
                      </small>
                    </span>
                  </button>
                </div>
              ))}
              {visibleRequirements.map(({ requirement, resource }) => {
                if (!resource) return null;
                const ready = hasRequirement(resource, requirement, manifest.progress);
                return (
                  <div
                    className={[
                      "wt-needed-item",
                      ready ? "is-ready" : "is-missing",
                      !ready && resource.shop.purchasable ? "has-buy" : "",
                    ].join(" ")}
                    key={resource.id}
                  >
                    <button type="button" onClick={() => setActiveResource(resource)}>
                      {resource.imagePath && <img src={resource.imagePath} alt="" />}
                      <span>
                        <b>{resource.name}</b>
                        <small className="wt-needed-item__state">
                          <ReadinessMark ready={ready} />
                          {!ready && (
                            <span>
                              {resource.shop.purchasable
                                ? "✦ " + (resource.price?.priceCoins ?? 0)
                                : "需要满足"}
                            </span>
                          )}
                        </small>
                      </span>
                    </button>
                    {!ready && resource.shop.purchasable && (
                      <button
                        className="wt-needed-item__buy"
                        type="button"
                        disabled={busyTarget !== null}
                        onClick={() => handlePurchase(resource)}
                      >
                        补充
                      </button>
                    )}
                  </div>
                );
              })}
              {visibleMissingInputs.length === 0 && visibleRequirements.length === 0 && (
                <p>{detail?.node.recipes.length === 0 ? "这是探索起点，不需要额外准备。" : "来路与准备都已经齐全，可以点亮这个节点。"}</p>
              )}
            </div>
          </section>

          <div className="wt-backpack__groups">
            {RESOURCE_GROUPS.map((group) => (
              <section
                className={"wt-resource-group is-" + group.key}
                key={group.key}
                aria-labelledby={"wt-resource-" + group.key}
              >
                <header>
                  <h3 id={"wt-resource-" + group.key}>{group.label}</h3>
                  <span>{manifest.resources[group.key].length}</span>
                </header>
                <div className="wt-resource-grid">
                  {manifest.resources[group.key].map((resource) => (
                    <ResourceSlot
                      key={resource.id}
                      resource={resource}
                      progress={manifest.progress}
                      active={activeResource?.id === resource.id}
                      onInspect={setActiveResource}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section className="wt-resource-inspector" aria-live="polite">
            {activeResource ? (
              <>
                <div className="wt-resource-inspector__title">
                  {activeResource.imagePath && <img src={activeResource.imagePath} alt="" />}
                  <div>
                    <span>{RESOURCE_GROUPS.find((group) => group.key.startsWith(activeResource.kind))?.shortLabel ?? "资源"}</span>
                    <h3>{activeResource.name}</h3>
                  </div>
                </div>
                <p>{activeResource.description}</p>
                <div className="wt-resource-inspector__status">
                  <span>
                    {resourceCount(activeResource, manifest.progress) === "permanent"
                      ? "✓ 已永久学会"
                      : resourceCount(activeResource, manifest.progress) === "state"
                        ? "◇ 配方状态"
                        : activeResource.inventoryMode === "permanent-unlock"
                          ? "尚未学会"
                          : "背包数量：" + resourceCount(activeResource, manifest.progress)}
                  </span>
                  {activeResource.shop.purchasable && (
                    <button
                      type="button"
                      disabled={busyTarget !== null}
                      onClick={() => handlePurchase(activeResource)}
                    >
                      {busyTarget === activeResource.id
                        ? "正在保存…"
                        : activeResource.inventoryMode === "permanent-unlock"
                          && resourceCount(activeResource, manifest.progress) === "permanent"
                          ? "已经点亮"
                          : <>准备一个 <b>✦ {activeResource.price?.priceCoins ?? 0}</b></>}
                    </button>
                  )}
                </div>
              </>
            ) : <p>把指针移到一个星格上，看看它能做什么。</p>}
          </section>
        </aside>
      </div>

      <div className={"wt-notice" + (notice ? " is-visible" : "")} role="status" aria-live="polite">
        {notice}
      </div>

      {previewNode && (
        <div
          className="wt-art-preview"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wt-art-preview-title"
          onClick={closeArtworkPreview}
        >
          <div className="wt-art-preview__panel">
            <button
              ref={previewCloseRef}
              className="wt-art-preview__close"
              type="button"
              aria-label="关闭大图"
            >
              ×
            </button>
            <div className="wt-art-preview__image-frame">
              <NodeArtwork
                node={previewNode}
                className="wt-art-preview__image"
                placeholderTexture={manifest.placeholderTexture}
              />
            </div>
            <h2 id="wt-art-preview-title">{previewNode.name}</h2>
            <p>点击任意位置关闭</p>
          </div>
        </div>
      )}
    </main>
  );
}
