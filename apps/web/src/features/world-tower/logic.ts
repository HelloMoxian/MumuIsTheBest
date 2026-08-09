import type {
  WorldTowerLevel,
  WorldTowerMapEdge,
  WorldTowerNode,
} from "./types";

export const WORLD_MAP_WIDTH = 980;
export const WORLD_MAP_BAND_HEADER_HEIGHT = 58;
export const WORLD_MAP_NODE_ROW_HEIGHT = 116;
export const WORLD_MAP_GRAPH_COLUMN_GAP = 106;
export const WORLD_MAP_MIN_COLUMNS = 6;
export const WORLD_MAP_MAX_COLUMNS = 11;

export type AtlasCellPlacement = {
  widthPercent: number;
  heightPercent: number;
  translateXPercent: number;
  translateYPercent: number;
};

export function atlasCellPlacement(crop: {
  columns: number;
  rows: number;
  index: number;
}): AtlasCellPlacement {
  const columns = Math.max(1, Math.floor(crop.columns));
  const rows = Math.max(1, Math.floor(crop.rows));
  const maxIndex = columns * rows - 1;
  const index = Math.min(maxIndex, Math.max(0, Math.floor(crop.index)));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    widthPercent: columns * 100,
    heightPercent: rows * 100,
    translateXPercent: -(column / columns) * 100,
    translateYPercent: -(row / rows) * 100,
  };
}

export type WorldMapPosition = { x: number; y: number };
export type WorldMapBand = { top: number; height: number };
export type FrameQuality = "common" | "rare" | "epic" | "legendary";

export function frameQualityForLevel(levelOrder: number): FrameQuality {
  if (levelOrder <= 4) return "legendary";
  if (levelOrder <= 8) return "epic";
  if (levelOrder <= 12) return "rare";
  return "common";
}

export function visibleNodeName(node: WorldTowerNode) {
  return node.isUnlocked ? node.name : "？";
}

export function initialWorldTowerTarget(
  nodes: WorldTowerNode[],
  levels: WorldTowerLevel[],
) {
  const bottomLevel = [...levels].sort((left, right) => right.order - left.order)[0];
  if (!bottomLevel) return { levelId: null, nodeId: null };
  const bottomNodes = nodes.filter((node) => node.levelId === bottomLevel.id);
  const preferredNode = bottomNodes.find((node) => node.name === "电子")
    ?? bottomNodes.find((node) => node.name === "质子")
    ?? bottomNodes[0];
  return {
    levelId: bottomLevel.id,
    nodeId: preferredNode?.id ?? null,
  };
}

export function bottomAlignedScrollTop(
  layoutHeight: number,
  viewportHeight: number,
  zoom: number,
) {
  return Math.max(0, layoutHeight * Math.max(0.1, zoom) - Math.max(0, viewportHeight));
}

export function layoutWorldTowerMap(
  nodes: WorldTowerNode[],
  _edges: WorldTowerMapEdge[],
  levels: WorldTowerLevel[],
  availableWidth = WORLD_MAP_WIDTH,
) {
  const width = Math.max(WORLD_MAP_WIDTH, availableWidth);
  const columnCount = Math.max(
    WORLD_MAP_MIN_COLUMNS,
    Math.min(WORLD_MAP_MAX_COLUMNS, Math.floor((width - 72) / WORLD_MAP_GRAPH_COLUMN_GAP)),
  );
  const positions = new Map<string, WorldMapPosition>();
  const bands = new Map<string, WorldMapBand>();
  let top = 0;

  for (const level of [...levels].sort((left, right) => left.order - right.order)) {
    const levelNodes = nodes.filter((node) => node.levelId === level.id);
    const rowCount = Math.max(1, Math.ceil(levelNodes.length / columnCount));
    const height = WORLD_MAP_BAND_HEADER_HEIGHT + rowCount * WORLD_MAP_NODE_ROW_HEIGHT + 18;
    bands.set(level.id, { top, height });

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowNodes = levelNodes.slice(rowIndex * columnCount, (rowIndex + 1) * columnCount);
      const rowWidth = Math.max(0, (rowNodes.length - 1) * WORLD_MAP_GRAPH_COLUMN_GAP);
      const startX = width / 2 - rowWidth / 2;
      rowNodes.forEach((node, columnIndex) => {
        positions.set(node.id, {
          x: startX + columnIndex * WORLD_MAP_GRAPH_COLUMN_GAP,
          y: top + WORLD_MAP_BAND_HEADER_HEIGHT + 51 + rowIndex * WORLD_MAP_NODE_ROW_HEIGHT,
        });
      });
    }
    top += height;
  }

  return { width, height: top, positions, bands, columnCount };
}

export function activeLevelAtViewport(
  bands: ReadonlyMap<string, WorldMapBand>,
  levels: WorldTowerLevel[],
  scrollTop: number,
  viewportHeight: number,
  zoom: number,
) {
  const safeZoom = Math.max(0.1, zoom);
  const ordered = [...levels].sort((left, right) => left.order - right.order);
  const contentBottom = ordered.reduce((maximum, level) => {
    const band = bands.get(level.id);
    return band ? Math.max(maximum, band.top + band.height) : maximum;
  }, 0) * safeZoom;
  if (scrollTop + viewportHeight >= contentBottom - 2) {
    return ordered.at(-1)?.id ?? null;
  }
  const readingLine = (scrollTop + viewportHeight * 0.3) / safeZoom;
  return ordered.find((level) => {
    const band = bands.get(level.id);
    return band && readingLine >= band.top && readingLine < band.top + band.height;
  })?.id ?? ordered.at(-1)?.id ?? null;
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
