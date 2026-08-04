import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  loadWorldTowerManifest,
  loadWorldTowerNode,
  loadWorldTowerNodes,
  purchaseWorldTowerResource,
  unlockWorldTowerNode,
} from "./api";
import {
  buildResourceMap,
  frameQualityForLevel,
  hasRequirement,
  recipeRequirements,
  resourceCount,
  visibleNodeName,
} from "./logic";
import type {
  NodePage,
  ResourceGroupKey,
  WorldTowerManifest,
  WorldTowerNode,
  WorldTowerNodeDetail,
  WorldTowerProgress,
  WorldTowerResource,
} from "./types";
import "./world-tower.css";

const PAGE_SIZE = 30;
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
  { key: "actions", label: "动作背包", shortLabel: "动作" },
  { key: "conditions", label: "成立条件", shortLabel: "条件" },
  { key: "environments", label: "环境场", shortLabel: "环境" },
  { key: "knowledge", label: "知识星图", shortLabel: "知识" },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "探索舱暂时没有回应，请稍后再试。";
}

function RuneNode({
  node,
  levelOrder,
  frames,
  placeholderTexture,
  relation = "normal",
  size = "normal",
  onSelect,
}: {
  node: WorldTowerNode;
  levelOrder: number;
  frames: Record<string, string>;
  placeholderTexture: string;
  relation?: "normal" | "input" | "current" | "output";
  size?: "compact" | "normal" | "large";
  onSelect: (nodeId: string) => void;
}) {
  const quality = frameQualityForLevel(levelOrder);
  const imagePath = node.imagePath ?? placeholderTexture;
  const label = visibleNodeName(node);

  return (
    <button
      className={[
        "wt-rune-node",
        `is-${relation}`,
        `is-${size}`,
        node.isUnlocked ? "is-unlocked" : "is-locked",
      ].join(" ")}
      type="button"
      onClick={() => onSelect(node.id)}
      aria-label={node.isUnlocked ? `查看${node.name}的构成关系` : `未发现节点，需要${node.unlockPriceCoins ?? 0}发现币点亮`}
    >
      <span className="wt-rune-node__orb" aria-hidden="true">
        <img className="wt-rune-node__content" src={imagePath} alt="" loading="lazy" />
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

function RelationGroup({
  label,
  emptyLabel,
  nodes,
  relation,
  manifest,
  onSelect,
}: {
  label: string;
  emptyLabel: string;
  nodes: WorldTowerNode[];
  relation: "input" | "output";
  manifest: WorldTowerManifest;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <section className={`wt-relation-group is-${relation}`} aria-label={label}>
      <span className="wt-relation-group__eyebrow">{label}</span>
      <div className="wt-relation-group__nodes">
        {nodes.length > 0 ? nodes.slice(0, 3).map((node) => (
          <RuneNode
            key={node.id}
            node={node}
            levelOrder={manifest.levels.find((level) => level.id === node.levelId)?.order ?? 1}
            frames={manifest.frames}
            placeholderTexture={manifest.placeholderTexture}
            relation={relation}
            size="compact"
            onSelect={onSelect}
          />
        )) : <p className="wt-relation-group__empty">{emptyLabel}</p>}
      </div>
    </section>
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
      className={`wt-resource-slot${active ? " is-active" : ""}`}
      type="button"
      onMouseEnter={() => onInspect(resource)}
      onFocus={() => onInspect(resource)}
      onClick={() => onInspect(resource)}
      aria-label={`${resource.name}，${count === "permanent" ? "已经学会" : count === "state" ? "过程状态" : resource.inventoryMode === "permanent-unlock" ? "尚未学会" : `现有${count}个`}`}
    >
      {resource.imagePath
        ? <img src={resource.imagePath} alt="" loading="lazy" />
        : <span className="wt-resource-slot__fallback" aria-hidden="true">?</span>}
      <span className="wt-resource-slot__count" aria-hidden="true">{badge}</span>
    </button>
  );
}

function WorldTowerLoading() {
  return (
    <main className="wt-page is-loading" aria-live="polite">
      <div className="wt-loading-card">
        <span className="wt-loading-orbit" aria-hidden="true" />
        <strong>正在铺开万物星图…</strong>
        <span>先找到粒子，再把山河与星海接上来</span>
      </div>
    </main>
  );
}

export function WorldTowerPage() {
  const [manifest, setManifest] = useState<WorldTowerManifest | null>(null);
  const [levelId, setLevelId] = useState("");
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [nodePage, setNodePage] = useState<NodePage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorldTowerNodeDetail | null>(null);
  const [activeResource, setActiveResource] = useState<WorldTowerResource | null>(null);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [nodesLoading, setNodesLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [phrase] = useState(
    () => DISCOVERY_PHRASES[Math.floor(Math.random() * DISCOVERY_PHRASES.length)],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadWorldTowerManifest(controller.signal)
      .then((nextManifest) => {
        setManifest(nextManifest);
        setLevelId(nextManifest.levels[0]?.id ?? "");
        setActiveResource(nextManifest.resources.actions[0] ?? null);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setFatalError(errorMessage(error));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!levelId) return;
    const controller = new AbortController();
    setNodesLoading(true);
    loadWorldTowerNodes(
      levelId,
      clusterId,
      pageIndex * PAGE_SIZE,
      PAGE_SIZE,
      controller.signal,
    )
      .then((nextPage) => {
        setNodePage(nextPage);
        setSelectedId((current) => {
          if (current && nextPage.items.some((node) => node.id === current)) return current;
          return nextPage.items.find((node) => node.isUnlocked)?.id
            ?? nextPage.items[0]?.id
            ?? null;
        });
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setNotice(errorMessage(error));
      })
      .finally(() => setNodesLoading(false));
    return () => controller.abort();
  }, [levelId, clusterId, pageIndex]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    loadWorldTowerNode(selectedId, controller.signal)
      .then(setDetail)
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setNotice(errorMessage(error));
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  const selectedLevel = manifest?.levels.find((level) => level.id === levelId) ?? null;
  const levelClusters = useMemo(
    () => manifest?.clusters.filter((cluster) => cluster.levelId === levelId) ?? [],
    [manifest, levelId],
  );
  const resourceById = useMemo(
    () => manifest ? buildResourceMap(manifest) : new Map<string, WorldTowerResource>(),
    [manifest],
  );
  const selectedRecipe = detail?.node.recipes[0];
  const allRequirements = useMemo(
    () => recipeRequirements(selectedRecipe, resourceById),
    [selectedRecipe, resourceById],
  );
  const missingInputCount = detail?.inputs.filter((node) => !node.isUnlocked).length ?? 0;
  const missingResources = manifest
    ? allRequirements.filter(({ requirement, resource }) => (
        resource ? !hasRequirement(resource, requirement, manifest.progress) : true
      ))
    : [];
  const canUnlock = Boolean(
    detail
    && !detail.node.isUnlocked
    && missingInputCount === 0
    && missingResources.length === 0,
  );
  const pageCount = nodePage ? Math.max(1, Math.ceil(nodePage.total / PAGE_SIZE)) : 1;

  function updateProgress(progress: WorldTowerProgress) {
    setManifest((current) => current ? { ...current, progress } : current);
  }

  function chooseLevel(nextLevelId: string) {
    setLevelId(nextLevelId);
    setClusterId(null);
    setPageIndex(0);
    setSelectedId(null);
    setDetail(null);
    setNotice("");
  }

  async function handleUnlock() {
    if (!detail || detail.node.isUnlocked || busyTarget) return;
    if (!canUnlock) {
      setNotice("先沿着高亮来路点亮输入，再把缺少的动作或知识准备好。");
      return;
    }
    setBusyTarget(detail.node.id);
    setNotice("正在把这次发现安全地写入本机进度…");
    try {
      const result = await unlockWorldTowerNode(detail.node.id);
      updateProgress(result.progress);
      setNodePage((current) => current ? {
        ...current,
        items: current.items.map((node) => (
          node.id === detail.node.id ? { ...node, isUnlocked: true } : node
        )),
      } : current);
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
    setNotice(`正在准备“${resource.name}”…`);
    try {
      const result = await purchaseWorldTowerResource(resource.id);
      updateProgress(result.progress);
      setNotice(
        result.alreadyUnlocked
          ? `“${resource.name}”已经永久点亮。`
          : resource.inventoryMode === "charge"
            ? `背包里增加了一个“${resource.name}”。`
            : `“${resource.name}”已经永久点亮。`,
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
  if (!manifest || !selectedLevel) return <WorldTowerLoading />;

  const selectedNode = detail?.node ?? nodePage?.items.find((node) => node.id === selectedId) ?? null;
  const backgroundStyle = {
    "--wt-background": `url("${manifest.backgroundAsset}")`,
  } as CSSProperties;

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
          <span><b>{manifest.counts.nodes.toLocaleString("zh-CN")}</b> 个发现</span>
          <span className="wt-coin"><i aria-hidden="true">✦</i> <b>{manifest.progress.coinBalance}</b> 发现币</span>
        </div>
      </header>

      <div className="wt-layout">
        <nav className="wt-level-rail" aria-label="万物尺度层级">
          <div className="wt-level-rail__line" aria-hidden="true" />
          {manifest.levels.map((level) => (
            <button
              key={level.id}
              className={level.id === levelId ? "is-active" : ""}
              type="button"
              onClick={() => chooseLevel(level.id)}
              aria-current={level.id === levelId ? "step" : undefined}
              title={level.description}
            >
              <span className="wt-level-rail__icon">
                <img src={level.imagePath} alt="" loading="lazy" />
              </span>
              <span className="wt-level-rail__number">{String(level.order).padStart(2, "0")}</span>
              <span className="wt-level-rail__name">{level.name}</span>
            </button>
          ))}
        </nav>

        <section className="wt-main-stage">
          <header className="wt-stage-heading">
            <div>
              <span>第 {selectedLevel.order} 层 · {manifest.counts.levelCounts[levelId] ?? 0} 个节点</span>
              <h2>{selectedLevel.name}</h2>
              <p>{selectedLevel.description}</p>
            </div>
            <div className="wt-cluster-chips" aria-label="当前层级分类">
              <button
                className={clusterId === null ? "is-active" : ""}
                type="button"
                onClick={() => { setClusterId(null); setPageIndex(0); }}
              >
                全部
              </button>
              {levelClusters.map((cluster) => (
                <button
                  key={cluster.id}
                  className={cluster.id === clusterId ? "is-active" : ""}
                  type="button"
                  onClick={() => { setClusterId(cluster.id); setPageIndex(0); }}
                >
                  {cluster.name}
                </button>
              ))}
            </div>
          </header>

          <section className="wt-relation-stage" aria-label="当前节点的来路和去向">
            {detailLoading && !detail ? (
              <div className="wt-relation-skeleton" aria-live="polite">正在连接构成线路…</div>
            ) : selectedNode ? (
              <div className="wt-relation-flow">
                <RelationGroup
                  label="组成来路"
                  emptyLabel={selectedNode.isUnlocked ? "这是探索的起点" : "点亮后查看来路"}
                  nodes={detail?.inputs ?? []}
                  relation="input"
                  manifest={manifest}
                  onSelect={setSelectedId}
                />

                <section className="wt-current-discovery" aria-label="当前发现">
                  <span className="wt-current-discovery__eyebrow">当前发现</span>
                  <RuneNode
                    node={selectedNode}
                    levelOrder={
                      manifest.levels.find((level) => level.id === selectedNode.levelId)?.order
                      ?? selectedLevel.order
                    }
                    frames={manifest.frames}
                    placeholderTexture={manifest.placeholderTexture}
                    relation="current"
                    size="large"
                    onSelect={setSelectedId}
                  />
                  <div className="wt-current-discovery__copy">
                    <strong>{selectedNode.isUnlocked ? selectedNode.name : "神秘节点"}</strong>
                    <p>
                      {selectedNode.isUnlocked
                        ? selectedNode.summary
                        : "把来路、动作与知识准备齐，再用发现币永久点亮它。"}
                    </p>
                  </div>
                  {!selectedNode.isUnlocked && (
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
                  )}
                  {selectedNode.isUnlocked && <span className="wt-discovered-badge">✓ 已永久点亮</span>}
                </section>

                <RelationGroup
                  label="可以去往"
                  emptyLabel={selectedNode.isUnlocked ? "更高的发现正在生长" : "点亮后查看去向"}
                  nodes={detail?.dependents ?? []}
                  relation="output"
                  manifest={manifest}
                  onSelect={setSelectedId}
                />
              </div>
            ) : (
              <div className="wt-relation-skeleton">这一页还没有可以展示的节点。</div>
            )}

            {selectedRecipe && (
              <div className="wt-recipe-strip">
                <div className="wt-recipe-strip__intro">
                  <span>这次构成需要</span>
                  <p>{selectedNode?.isUnlocked ? selectedRecipe.childExplanation : "最多显示四项关键准备，缺少的可以直接补齐。"}</p>
                </div>
                <div className="wt-recipe-strip__items">
                  {allRequirements.slice(0, 4).map(({ requirement, resource }) => {
                    if (!resource) return null;
                    const ready = hasRequirement(resource, requirement, manifest.progress);
                    const count = resourceCount(resource, manifest.progress);
                    return (
                      <button
                        key={resource.id}
                        className={`wt-requirement${ready ? " is-ready" : " is-missing"}`}
                        type="button"
                        onClick={() => setActiveResource(resource)}
                      >
                        {resource.imagePath && <img src={resource.imagePath} alt="" />}
                        <span>
                          <b>{resource.name}</b>
                          <small>
                            {ready
                              ? count === "state" ? "条件已标注" : "已经准备好"
                              : resource.shop.purchasable ? `缺少 · ✦ ${resource.price?.priceCoins ?? 0}` : "需要满足"}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                  {missingInputCount > 0 && (
                    <span className="wt-input-warning">还要点亮 {missingInputCount} 个来路节点</span>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="wt-node-browser" aria-labelledby="wt-node-browser-title">
            <header>
              <div>
                <span>同层发现</span>
                <h3 id="wt-node-browser-title">符文星图</h3>
              </div>
              <span>{nodePage ? `${nodePage.offset + 1}—${Math.min(nodePage.offset + nodePage.items.length, nodePage.total)} / ${nodePage.total}` : "—"}</span>
            </header>
            <div className={`wt-node-grid${nodesLoading ? " is-loading" : ""}`}>
              {nodePage?.items.map((node) => (
                <RuneNode
                  key={node.id}
                  node={node}
                  levelOrder={selectedLevel.order}
                  frames={manifest.frames}
                  placeholderTexture={manifest.placeholderTexture}
                  relation={node.id === selectedId ? "current" : "normal"}
                  onSelect={setSelectedId}
                />
              ))}
              {nodesLoading && Array.from({ length: 10 }, (_, index) => (
                <span className="wt-node-skeleton" key={index} aria-hidden="true" />
              ))}
            </div>
            <div className="wt-pagination">
              <button
                type="button"
                disabled={pageIndex === 0 || nodesLoading}
                onClick={() => setPageIndex((value) => value - 1)}
              >
                ← 上一页
              </button>
              <span>第 {pageIndex + 1} / {pageCount} 页</span>
              <button
                type="button"
                disabled={pageIndex >= pageCount - 1 || nodesLoading}
                onClick={() => setPageIndex((value) => value + 1)}
              >
                下一页 →
              </button>
            </div>
          </section>
        </section>

        <aside className="wt-backpack" aria-label="动作、条件、环境和知识背包">
          <header>
            <div>
              <span>探索工具箱</span>
              <h2>星格背包</h2>
            </div>
            <span className="wt-backpack__capacity">{manifest.counts.resources} 种</span>
          </header>

          <div className="wt-backpack__groups">
            {RESOURCE_GROUPS.map((group) => (
              <section
                className={`wt-resource-group is-${group.key}`}
                key={group.key}
                aria-labelledby={`wt-resource-${group.key}`}
              >
                <header>
                  <h3 id={`wt-resource-${group.key}`}>{group.label}</h3>
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
                          : `背包数量：${resourceCount(activeResource, manifest.progress)}`}
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

      <div className={`wt-notice${notice ? " is-visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </main>
  );
}
