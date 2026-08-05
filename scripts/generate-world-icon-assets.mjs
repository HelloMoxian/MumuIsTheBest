import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const catalogPath = path.join(
  repositoryRoot,
  "content",
  "chemistry",
  "compound-catalog.v1.json",
);
const outputDirectory = path.join(
  repositoryRoot,
  "apps",
  "web",
  "public",
  "images",
  "world-tower",
  "nodes",
  "atlases",
);

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const compounds = catalog.records;
const columns = 10;
const rows = 10;
const cellSize = 160;
const pageSize = columns * rows;

const atomColors = {
  H: [222, 236, 255],
  C: [68, 96, 142],
  N: [79, 129, 255],
  O: [255, 84, 117],
  F: [112, 232, 179],
  Cl: [95, 220, 139],
  Br: [199, 91, 74],
  I: [155, 102, 226],
  S: [255, 205, 72],
  P: [255, 146, 66],
  B: [244, 180, 135],
  Si: [218, 174, 117],
  Na: [136, 112, 255],
  K: [172, 94, 226],
  Ca: [92, 225, 159],
  Fe: [210, 120, 73],
  Cu: [207, 112, 69],
  Zn: [148, 161, 209],
  Ag: [202, 220, 238],
  Au: [255, 195, 60],
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function colorFor(symbol) {
  if (atomColors[symbol]) return atomColors[symbol];
  let hash = 0;
  for (const character of symbol) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return [120 + hash % 90, 110 + (hash >>> 8) % 100, 145 + (hash >>> 16) % 85];
}

function line(x1, y1, x2, y2, order, scale) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const count = Math.max(1, Math.min(3, Math.round(order || 1)));
  const gap = Math.max(1.8, 3.6 * scale);
  return Array.from({ length: count }, (_, index) => {
    const offset = (index - (count - 1) / 2) * gap;
    return `<line x1="${(x1 + normalX * offset).toFixed(2)}" y1="${(y1 + normalY * offset).toFixed(2)}" x2="${(x2 + normalX * offset).toFixed(2)}" y2="${(y2 + normalY * offset).toFixed(2)}" />`;
  }).join("");
}

function moleculeMarkup(record, pageIndex, cellIndex) {
  const column = cellIndex % columns;
  const row = Math.floor(cellIndex / columns);
  const left = column * cellSize;
  const top = row * cellSize;
  const centerX = left + cellSize / 2;
  const centerY = top + cellSize / 2;
  const hue = (pageIndex * 47 + cellIndex * 29) % 360;
  const atoms = record.structure?.atoms ?? [];
  const bonds = record.structure?.bonds ?? [];
  const points = atoms.length > 0
    ? atoms
    : Object.entries(record.atomCounts ?? {}).flatMap(([symbol, count], symbolIndex) => (
      Array.from({ length: Math.min(count, 12) }, (_, index) => {
        const angle = (symbolIndex * 1.7 + index) * Math.PI * 2 / Math.max(3, count);
        return { symbol, x: Math.cos(angle), y: Math.sin(angle) };
      })
    ));

  const xs = points.map((atom) => Number(atom.x) || 0);
  const ys = points.map((atom) => Number(atom.y) || 0);
  const minX = Math.min(...xs, -0.5);
  const maxX = Math.max(...xs, 0.5);
  const minY = Math.min(...ys, -0.5);
  const maxY = Math.max(...ys, 0.5);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min(104 / spanX, 104 / spanY, atoms.length > 55 ? 10 : 34);
  const translate = (atom) => ({
    x: centerX + ((Number(atom.x) || 0) - (minX + maxX) / 2) * scale,
    y: centerY + ((Number(atom.y) || 0) - (minY + maxY) / 2) * scale,
  });
  const positions = points.map(translate);
  const atomRadius = Math.max(2.2, Math.min(8.5, 8.8 - points.length * 0.055));

  const stars = Array.from({ length: 9 }, (_, starIndex) => {
    const seed = pageIndex * 997 + cellIndex * 67 + starIndex * 43;
    const x = left + 12 + seed % 136;
    const y = top + 10 + (seed * 17) % 140;
    const radius = 0.45 + (seed % 5) * 0.18;
    return `<circle cx="${x}" cy="${y}" r="${radius.toFixed(2)}" fill="hsla(${hue}, 95%, 78%, 0.62)" />`;
  }).join("");

  const bondMarkup = bonds.length > 0
    ? bonds.map((bond) => {
      const from = positions[bond.from];
      const to = positions[bond.to];
      if (!from || !to) return "";
      return line(from.x, from.y, to.x, to.y, bond.order, Math.min(1, scale / 18));
    }).join("")
    : positions.slice(1).map((position, index) => {
      const previous = positions[index];
      return `<line class="composition-link" x1="${previous.x.toFixed(2)}" y1="${previous.y.toFixed(2)}" x2="${position.x.toFixed(2)}" y2="${position.y.toFixed(2)}" />`;
    }).join("");

  const atomMarkup = points.map((atom, index) => {
    const [red, green, blue] = colorFor(atom.symbol);
    const position = positions[index];
    const radius = atom.symbol === "H" ? atomRadius * 0.72 : atomRadius;
    return `<g><circle cx="${position.x.toFixed(2)}" cy="${position.y.toFixed(2)}" r="${(radius + 2.2).toFixed(2)}" fill="rgba(${red},${green},${blue},0.22)" /><circle cx="${position.x.toFixed(2)}" cy="${position.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="rgb(${red},${green},${blue})" stroke="rgba(255,255,255,0.78)" stroke-width="0.8" /><circle cx="${(position.x - radius * 0.3).toFixed(2)}" cy="${(position.y - radius * 0.32).toFixed(2)}" r="${Math.max(0.7, radius * 0.22).toFixed(2)}" fill="rgba(255,255,255,0.72)" /></g>`;
  }).join("");

  return `<g aria-label="${escapeXml(record.name)}"><rect x="${left}" y="${top}" width="${cellSize}" height="${cellSize}" fill="url(#cell-${hue})" /><rect x="${left + 5}" y="${top + 5}" width="${cellSize - 10}" height="${cellSize - 10}" rx="24" fill="none" stroke="hsla(${hue}, 78%, 62%, 0.13)" />${stars}<g class="bonds">${bondMarkup}</g><g filter="url(#atom-glow)">${atomMarkup}</g></g>`;
}

function svgForPage(records, pageIndex) {
  const usedHues = new Set(records.map((_, index) => (pageIndex * 47 + index * 29) % 360));
  const gradients = [...usedHues].map((hue) => `<radialGradient id="cell-${hue}" cx="50%" cy="44%" r="70%"><stop offset="0" stop-color="hsl(${hue}, 54%, 19%)" /><stop offset="0.52" stop-color="#071733" /><stop offset="1" stop-color="#02091c" /></radialGradient>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellSize}" height="${rows * cellSize}" viewBox="0 0 ${columns * cellSize} ${rows * cellSize}"><defs>${gradients}<filter id="atom-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><style>.bonds{stroke:#bfeeff;stroke-width:2.2;stroke-linecap:round;filter:drop-shadow(0 0 3px #35cfff)}.composition-link{stroke-dasharray:4 4;opacity:.7}</style><rect width="100%" height="100%" fill="#02091c" />${records.map((record, index) => moleculeMarkup(record, pageIndex, index)).join("")}</svg>\n`;
}

fs.mkdirSync(outputDirectory, { recursive: true });
const pageCount = Math.ceil(compounds.length / pageSize);
for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
  const records = compounds.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const outputPath = path.join(
    outputDirectory,
    `compounds-${String(pageIndex + 1).padStart(2, "0")}-v2.svg`,
  );
  fs.writeFileSync(outputPath, svgForPage(records, pageIndex));
}

console.log(`已生成 ${pageCount} 张化合物语义图集，覆盖 ${compounds.length} 个节点。`);
