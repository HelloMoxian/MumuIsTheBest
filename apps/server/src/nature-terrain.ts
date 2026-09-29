import sharp from "sharp";

type Position = [number, number];
type Land = { features: { geometry: { type: string; coordinates: unknown } }[] };

/** Apply the same Mercator projection as the offline relief image, preserving holes. */
export async function maskTerrainToLand(image: Buffer, land: Land): Promise<Buffer> {
  const source = sharp(image, { limitInputPixels: 8192 * 8192 });
  const { width, height } = await source.metadata();
  if (!width || !height) throw new Error("Missing terrain dimensions");
  const project = ([longitude, latitude]: Position) => {
    const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
    return `${((longitude + 180) / 360 * width).toFixed(2)},${((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * height).toFixed(2)}`;
  };
  const paths: string[] = [];
  for (const feature of land.features) {
    const g = feature.geometry;
    const polygons = g.type === "MultiPolygon" ? g.coordinates as Position[][][]
      : g.type === "Polygon" ? [g.coordinates as Position[][]] : [];
    for (const polygon of polygons) {
      const d = polygon.filter(ring => ring.length >= 4).map(ring => `M${ring.map(project).join("L")}Z`).join("");
      if (d) paths.push(`<path d="${d}" fill="white" fill-rule="evenodd"/>`);
    }
  }
  if (!paths.length) throw new Error("Missing land polygons");
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths.join("")}</svg>`);
  return source.ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).webp({ lossless: true }).toBuffer();
}
