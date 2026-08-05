import type {
  RecipeRequirement,
  ResourceGroupKey,
  WorldTowerManifest,
  WorldTowerLevel,
  WorldTowerLevelGroup,
  WorldTowerMapEdge,
  WorldTowerNode,
  WorldTowerProgress,
  WorldTowerRecipe,
  WorldTowerResource,
} from "./types";

export const WORLD_MAP_WIDTH = 1_120;
export const WORLD_MAP_BAND_HEIGHT = 230;
export const WORLD_MAP_NODE_ROW_HEIGHT = 250;
export const WORLD_MAP_NODES_PER_ROW = 6;
export const WORLD_MAP_GRAPH_CENTER_X = 670;
export const WORLD_MAP_GRAPH_COLUMN_GAP = 148;

function nodeXInCenteredRow(rowLength: number, columnIndex: number) {
  return WORLD_MAP_GRAPH_CENTER_X
    + (columnIndex - (rowLength - 1) / 2) * WORLD_MAP_GRAPH_COLUMN_GAP;
}

export type WorldMapPosition = {
  x: number;
  y: number;
};

export type WorldMapBand = {
  top: number;
  height: number;
};

export type WorldMapGroupLayout = {
  id: string;
  name: string;
  levelId: string;
  top: number;
  height: number;
  nodeCount: number;
};

export type FrameQuality = "common" | "rare" | "epic" | "legendary";

export function frameQualityForLevel(levelOrder: number): FrameQuality {
  if (levelOrder >= 12) return "legendary";
  if (levelOrder >= 8) return "epic";
  if (levelOrder >= 4) return "rare";
  return "common";
}

export function visibleNodeName(node: WorldTowerNode) {
  return node.isUnlocked ? node.name : "未发现";
}

export function resourceCount(
  resource: WorldTowerResource,
  progress: WorldTowerProgress,
): number | "permanent" | "state" {
  if (resource.inventoryMode === "charge") {
    return progress.resourceInventory[resource.id] ?? 0;
  }
  if (resource.inventoryMode === "permanent-unlock") {
    return progress.permanentResourceIds.includes(resource.id) ? "permanent" : 0;
  }
  return "state";
}

export function hasRequirement(
  resource: WorldTowerResource,
  requirement: RecipeRequirement,
  progress: WorldTowerProgress,
) {
  const count = resourceCount(resource, progress);
  if (count === "state" || count === "permanent") return true;
  return count >= requirement.amount;
}

const resourceGroupOrder: ResourceGroupKey[] = [
  "particlePacks",
  "actions",
  "conditions",
  "environments",
  "knowledge",
];

export function recipeRequirements(
  recipe: WorldTowerRecipe | undefined,
  resourcesById: ReadonlyMap<string, WorldTowerResource>,
) {
  if (!recipe) return [];
  return resourceGroupOrder.flatMap((group) =>
    recipe.requirements[group].map((requirement) => ({
      group,
      requirement,
      resource: resourcesById.get(requirement.resourceId) ?? null,
    })),
  );
}

export function buildResourceMap(manifest: WorldTowerManifest) {
  return new Map(
    Object.values(manifest.resources)
      .flat()
      .map((resource) => [resource.id, resource] as const),
  );
}

export function layoutWorldTowerMap(
  nodes: WorldTowerNode[],
  edges: WorldTowerMapEdge[],
  levels: WorldTowerLevel[],
  expanded?: {
    levelId: string;
    groups: WorldTowerLevelGroup[];
  } | null,
) {
  const positions = new Map<string, WorldMapPosition>();
  const bands = new Map<string, WorldMapBand>();
  const groupLayouts: WorldMapGroupLayout[] = [];
  const incomingByTarget = new Map<string, string[]>();
  for (const edge of edges) {
    const incoming = incomingByTarget.get(edge.targetId) ?? [];
    incoming.push(edge.sourceId);
    incomingByTarget.set(edge.targetId, incoming);
  }
  const levelsDescending = [...levels].sort((left, right) => right.order - left.order);
  let mapTop = 0;
  for (const level of levelsDescending) {
    const levelNodeCount = nodes.filter((node) => node.levelId === level.id).length;
    const levelRows = Math.max(1, Math.ceil(levelNodeCount / WORLD_MAP_NODES_PER_ROW));
    let height = 110 + levelRows * WORLD_MAP_NODE_ROW_HEIGHT;
    if (expanded?.levelId === level.id) {
      height = expanded.groups.length === 0
        ? 330
        : 110 + expanded.groups.reduce((sum, group) => (
            sum + 90 + Math.ceil(group.nodeIds.length / WORLD_MAP_NODES_PER_ROW) * WORLD_MAP_NODE_ROW_HEIGHT
          ), 0);
    }
    bands.set(level.id, { top: mapTop, height });
    mapTop += height;
  }
  const orderedLevels = [...levels].sort((left, right) => left.order - right.order);

  for (const level of orderedLevels) {
    const band = bands.get(level.id)!;
    if (expanded?.levelId === level.id) {
      let groupTop = band.top + 110;
      for (const group of expanded.groups) {
        const groupNodes = group.nodeIds
          .map((nodeId) => nodes.find((node) => node.id === nodeId))
          .filter((node): node is WorldTowerNode => Boolean(node));
        const rows = Math.ceil(groupNodes.length / WORLD_MAP_NODES_PER_ROW);
        const groupHeight = 90 + rows * WORLD_MAP_NODE_ROW_HEIGHT;
        groupLayouts.push({
          id: group.id,
          name: group.name,
          levelId: level.id,
          top: groupTop,
          height: groupHeight,
          nodeCount: groupNodes.length,
        });
        for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
          const rowNodes = groupNodes.slice(
            rowIndex * WORLD_MAP_NODES_PER_ROW,
            (rowIndex + 1) * WORLD_MAP_NODES_PER_ROW,
          );
          rowNodes.forEach((node, columnIndex) => {
            const x = nodeXInCenteredRow(rowNodes.length, columnIndex);
            const y = groupTop + 78 + rowIndex * WORLD_MAP_NODE_ROW_HEIGHT + 105;
            positions.set(node.id, { x, y });
          });
        }
        groupTop += groupHeight;
      }
      continue;
    }
    const levelNodes = nodes
      .filter((node) => node.levelId === level.id)
      .map((node) => {
        const incomingPositions = (incomingByTarget.get(node.id) ?? [])
          .map((nodeId) => positions.get(nodeId)?.x)
          .filter((value): value is number => value !== undefined);
        return {
          node,
          anchor: incomingPositions.length > 0
            ? incomingPositions.reduce((sum, value) => sum + value, 0) / incomingPositions.length
            : null,
        };
      })
      .sort((left, right) => {
        if (left.anchor !== null && right.anchor !== null) return left.anchor - right.anchor;
        if (left.anchor !== null) return -1;
        if (right.anchor !== null) return 1;
        return left.node.clusterId.localeCompare(right.node.clusterId, "zh-CN")
          || left.node.id.localeCompare(right.node.id, "zh-CN");
      });

    levelNodes.forEach(({ node }, index) => {
      const rowIndex = Math.floor(index / WORLD_MAP_NODES_PER_ROW);
      const rowStart = rowIndex * WORLD_MAP_NODES_PER_ROW;
      const rowLength = Math.min(WORLD_MAP_NODES_PER_ROW, levelNodes.length - rowStart);
      const columnIndex = index - rowStart;
      const x = nodeXInCenteredRow(rowLength, columnIndex);
      const y = band.top + 215 + rowIndex * WORLD_MAP_NODE_ROW_HEIGHT;
      positions.set(node.id, { x, y });
    });
  }

  return {
    width: WORLD_MAP_WIDTH,
    height: mapTop + 40,
    positions,
    bands,
    groupLayouts,
  };
}

export function traceWorldTowerRelations(
  selectedId: string | null,
  edges: WorldTowerMapEdge[],
) {
  const ancestors = new Set<string>();
  const descendants = new Set<string>();
  if (!selectedId) return { ancestors, descendants };

  for (const edge of edges) {
    if (edge.targetId === selectedId) ancestors.add(edge.sourceId);
    if (edge.sourceId === selectedId) descendants.add(edge.targetId);
  }
  return { ancestors, descendants };
}
