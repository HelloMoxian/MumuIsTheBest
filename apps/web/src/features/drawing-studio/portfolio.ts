import {
  clampZoom, parseDrawingDocument, type DrawingDocument, type ShapeElement,
} from "./logic";

export type PortfolioEntry = {
  id: string; categoryId: string; title: string; subjects: string[];
  elementCount: number; complexity: string;
  bounds: { x: number; y: number; width: number; height: number };
};
export type PortfolioCatalog = {
  schemaVersion: 1;
  categories: { id: string; label: string; count: number }[];
  works: PortfolioEntry[];
};
export type PortfolioWork = Omit<DrawingDocument, "elements"> & { elements: ShapeElement[] };
const primitives = new Set(["free-rectangle", "free-ellipse", "free-triangle"]);
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const short = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 80;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 1_000;

export function parsePortfolioCatalog(value: unknown): PortfolioCatalog {
  if (!record(value) || value.schemaVersion !== 1 || value.style !== "primitive-diy"
    || !Array.isArray(value.categories) || !Array.isArray(value.works)
    || value.categories.length > 100 || value.works.length > 1_000) throw new Error("作品集目录暂时无法识别。");
  const ids = new Set<string>();
  const categories = value.categories.map((c) => {
    if (!record(c) || !short(c.id) || !/^category-\d{2}$/.test(c.id) || !short(c.label) || !positive(c.count) || ids.has(c.id)) {
      throw new Error("作品集分类不完整。");
    }
    ids.add(c.id);
    return { id: c.id, label: c.label, count: c.count };
  });
  const workIds = new Set<string>();
  const works = value.works.map((w): PortfolioEntry => {
    if (!record(w) || !short(w.id) || !/^pc-\d{3}$/.test(w.id) || workIds.has(w.id)
      || !short(w.categoryId) || !ids.has(w.categoryId) || !short(w.title)
      || !Array.isArray(w.subjects) || w.subjects.length > 20 || !w.subjects.every(short)
      || !positive(w.elementCount) || !short(w.complexity) || !record(w.bounds)
      || w.bounds.x !== 0 || w.bounds.y !== 0 || w.bounds.width !== 1000 || w.bounds.height !== 800) {
      throw new Error("作品集索引不完整。");
    }
    workIds.add(w.id);
    return { id: w.id, categoryId: w.categoryId, title: w.title, subjects: w.subjects,
      elementCount: w.elementCount, complexity: w.complexity, bounds: { x: 0, y: 0, width: 1000, height: 800 } };
  });
  if (categories.some((c) => works.filter((w) => w.categoryId === c.id).length !== c.count)) throw new Error("作品集数量不完整。");
  return { schemaVersion: 1, categories, works };
}

export function parsePortfolioCategory(value: unknown, categoryId: string, catalog: PortfolioCatalog): Map<string, PortfolioWork> {
  const entries = catalog.works.filter((w) => w.categoryId === categoryId);
  if (!catalog.categories.some((c) => c.id === categoryId) || !record(value) || value.schemaVersion !== 1
    || value.categoryId !== categoryId || !Array.isArray(value.works) || value.works.length !== entries.length) {
    throw new Error("这一类作品没有完整打开，请重试。");
  }
  const works = new Map<string, PortfolioWork>();
  for (const item of value.works) {
    if (!record(item) || !short(item.id) || works.has(item.id)) throw new Error("作品编号不完整。");
    const entry = entries.find((w) => w.id === item.id);
    const doc = parseDrawingDocument(item.document);
    if (!entry || (doc.portfolioReferenceId !== undefined && doc.portfolioReferenceId !== item.id) || doc.title !== entry.title || doc.elements.length !== entry.elementCount || doc.presets.length !== 0
      || !doc.elements.every((e): e is ShapeElement => e.type === "shape" && primitives.has(e.shape)
        && e.fill === "#ffffff" && e.stroke === "#000000" && e.strokeWidth === 3 && e.groupId === undefined)) {
      throw new Error("这幅作品的基础图形不完整。");
    }
    works.set(item.id, doc as PortfolioWork);
  }
  return works;
}

export function filterPortfolio(catalog: PortfolioCatalog, categoryId: string, query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return catalog.works.filter((w) => (categoryId === "all" || w.categoryId === categoryId)
    && words.every((word) => `${w.id} ${w.title} ${w.subjects.join(" ")} ${catalog.categories.find((c) => c.id === w.categoryId)?.label ?? ""}`.toLocaleLowerCase().includes(word)));
}

/** View changes alone do not count as editing an untouched template. */
export function portfolioContentSignature(doc: DrawingDocument) {
  return JSON.stringify([doc.title, doc.author, doc.elements, doc.presets, doc.portfolioReferenceId]);
}

export function createPortfolioDocument(template: PortfolioWork, current: DrawingDocument, size: { width: number; height: number }): DrawingDocument {
  const now = new Date().toISOString();
  const width = Number.isFinite(size.width) ? Math.max(1, size.width) : 1000;
  const height = Number.isFinite(size.height) ? Math.max(1, size.height) : 800;
  const zoom = clampZoom(Math.min((width - 40) / 1000, (height - 40) / 800, 1));
  return {
    ...structuredClone(template), id: crypto.randomUUID(), createdAt: now, updatedAt: now,
    author: current.author, presets: structuredClone(current.presets),
    elements: template.elements.map((e) => ({ ...e, id: crypto.randomUUID() })),
    viewport: { zoom, x: (width - 1000 * zoom) / 2, y: (height - 800 * zoom) / 2 },
  };
}

/** Only return the replacement after the existing work has been preserved. */
export async function preparePortfolioOpening(options: {
  current: DrawingDocument; template: PortfolioWork; size: { width: number; height: number };
  checkpointId: string | null; saveCheckpoint: (document: DrawingDocument) => Promise<void>;
}): Promise<DrawingDocument> {
  const next = createPortfolioDocument(options.template, options.current, options.size);
  if (options.checkpointId) {
    const snapshot = structuredClone(options.current);
    const now = new Date().toISOString();
    snapshot.id = options.checkpointId;
    snapshot.title = `${snapshot.title.slice(0, 69)} · 保留副本`;
    snapshot.createdAt = now;
    snapshot.updatedAt = now;
    await options.saveCheckpoint(snapshot);
  }
  return next;
}
