import { parsePortfolioCatalog, parsePortfolioCategory, type PortfolioCatalog, type PortfolioWork } from "./portfolio";

const modules = import.meta.glob("../../../../../content/drawing-studio/portfolio/category-*.v1.json");
const categories = new Map<string, Promise<Map<string, PortfolioWork>>>();

export async function loadPortfolioCatalog(): Promise<PortfolioCatalog> {
  const { default: value } = await import("../../../../../content/drawing-studio/portfolio/catalog.v1.json");
  return parsePortfolioCatalog(value);
}

export function loadPortfolioCategory(id: string, catalog: PortfolioCatalog) {
  const cached = categories.get(id);
  if (cached) return cached;
  const load = modules[`../../../../../content/drawing-studio/portfolio/${id}.v1.json`];
  const promise = (async () => {
    if (!load) throw new Error("这一类作品暂时找不到，请重新打开作品集。");
    const value = await load() as { default: unknown };
    return parsePortfolioCategory(value.default, id, catalog);
  })();
  categories.set(id, promise);
  void promise.catch(() => { if (categories.get(id) === promise) categories.delete(id); });
  return promise;
}
