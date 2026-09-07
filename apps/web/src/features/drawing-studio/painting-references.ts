import manifest from "../../../../../content/drawing-studio/portfolio/references.v1.json";

export type PaintingReference = (typeof manifest.works)[number];
const references = new Map(manifest.works.map((work) => [work.id, work]));
export function getPaintingReference(id: string | undefined): PaintingReference | undefined {
  return id ? references.get(id) : undefined;
}

export function clampReferencePosition(position: { x: number; y: number }, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  return {
    x: Math.max(8, Math.min(position.x, viewport.width - size.width - 8)),
    y: Math.max(8, Math.min(position.y, viewport.height - size.height - 8)),
  };
}
