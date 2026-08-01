import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "content/chemistry/element-compounds.v1.json",
);
const REQUEST_GAP_MS = 260;

const ELEMENT_SYMBOL_BY_ATOMIC_NUMBER = [
  "", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K",
  "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y",
  "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr",
  "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
];

const CANDIDATES = [
  {
    query: "disodium helide",
    formula: "Na2He",
    name: "二钠氦化物",
    feature: "只在极高压力下稳定的含氦晶体，用配方单元示意组成。",
    kind: "formula-unit",
    manualSource: {
      name: "Nature Chemistry",
      url: "https://doi.org/10.1038/nchem.2716",
    },
  },
  ["lithium fluoride", "LiF", "氟化锂", "由锂和氟组成的离子晶体。"],
  ["beryllium fluoride", "BeF2", "氟化铍", "由铍和氟组成，页面只展示配方单元。"],
  {
    query: "neon gold fluoride complex",
    formula: "NeAuF",
    name: "氖—金—氟配合物",
    feature: "在低温基质中被光谱表征的稀有氖配合物，用组成结构示意。",
    kind: "formula-unit",
    manualSource: {
      name: "Angewandte Chemie International Edition",
      url: "https://doi.org/10.1002/anie.201205072",
    },
  },
  ["sodium chloride", "NaCl", "氯化钠", "食盐的主要成分，是典型离子晶体。"],
  ["magnesium oxide", "MgO", "氧化镁", "由镁和氧组成的离子晶体。"],
  ["aluminium oxide", "Al2O3", "氧化铝", "刚玉和许多陶瓷材料的重要成分。"],
  {
    query: "argon fluorohydride",
    formula: "HArF",
    name: "氟氢化氩",
    feature: "在极低温固态氩中发现的稀有氩化合物。",
    kind: "molecule",
    manualSource: {
      name: "Nature",
      url: "https://doi.org/10.1038/35022551",
    },
    manualTopology: {
      atoms: [
        { symbol: "H", x: -1, y: 0 },
        { symbol: "Ar", x: 0, y: 0 },
        { symbol: "F", x: 1, y: 0 },
      ],
      bonds: [
        { from: 0, to: 1, order: 1 },
        { from: 1, to: 2, order: 1 },
      ],
    },
  },
  ["potassium chloride", "KCl", "氯化钾", "由钾离子和氯离子组成的晶体。"],
  ["calcium oxide", "CaO", "氧化钙", "常见无机材料，也叫生石灰。"],
  ["scandium fluoride", "ScF3", "氟化钪", "含钪和氟的无机配方单元。"],
  ["titanium dioxide", "TiO2", "二氧化钛", "常见白色材料，可用于颜料。"],
  ["vanadium pentoxide", "V2O5", "五氧化二钒", "含钒的氧化物，仅作虚拟认识。"],
  ["chromium(III) oxide", "Cr2O3", "三氧化二铬", "稳定的绿色铬氧化物。"],
  ["manganese dioxide", "MnO2", "二氧化锰", "电池材料中常见的锰氧化物。"],
  ["iron(III) oxide", "Fe2O3", "三氧化二铁", "铁锈和赤铁矿中的常见成分。"],
  ["cobalt(II) oxide", "CoO", "氧化钴", "含钴和氧的无机固体。"],
  ["nickel(II) oxide", "NiO", "氧化镍", "含镍和氧的无机固体。"],
  ["copper(II) oxide", "CuO", "氧化铜", "常见的黑色铜氧化物。"],
  ["zinc oxide", "ZnO", "氧化锌", "可用于陶瓷和防晒材料。"],
  ["gallium(III) oxide", "Ga2O3", "三氧化二镓", "用于研究功率电子器件的宽禁带材料。"],
  ["germanium dioxide", "GeO2", "二氧化锗", "含锗的氧化物，可用于特种玻璃。"],
  ["arsenic trioxide", "As2O3", "三氧化二砷", "有毒的砷氧化物，只作虚拟认识。"],
  ["selenium dioxide", "SeO2", "二氧化硒", "含硒和氧的无机化合物。"],
  { query: "krypton difluoride", formula: "KrF2", name: "二氟化氪", feature: "少数已知的氪化合物之一。", kind: "molecule" },
  ["rubidium chloride", "RbCl", "氯化铷", "由铷和氯组成的离子晶体。"],
  ["strontium oxide", "SrO", "氧化锶", "由锶和氧组成的无机固体。"],
  ["yttrium oxide", "Y2O3", "氧化钇", "可用于发光材料和陶瓷。"],
  ["zirconium dioxide", "ZrO2", "二氧化锆", "坚固耐热的陶瓷材料。"],
  ["niobium pentoxide", "Nb2O5", "五氧化二铌", "含铌的稳定氧化物。"],
  ["molybdenum trioxide", "MoO3", "三氧化钼", "含钼的氧化物，可用于材料研究。"],
  ["technetium(VII) oxide", "Tc2O7", "七氧化二锝", "含放射性锝的氧化物，仅作虚拟认识。"],
  { query: "ruthenium tetroxide", formula: "RuO4", name: "四氧化钌", feature: "挥发性且危险的钌氧化物，只作虚拟认识。", kind: "molecule" },
  ["rhodium(III) oxide", "Rh2O3", "三氧化二铑", "含铑和氧的无机固体。"],
  ["palladium(II) chloride", "PdCl2", "氯化钯", "常见的含钯无机配方单元。"],
  ["silver chloride", "AgCl", "氯化银", "遇光会发生变化的银盐。"],
  ["cadmium sulfide", "CdS", "硫化镉", "有毒的黄色半导体材料，只作虚拟认识。"],
  ["indium(III) oxide", "In2O3", "三氧化二铟", "透明导电材料中的常见氧化物。"],
  ["tin(IV) oxide", "SnO2", "二氧化锡", "常用于陶瓷和传感材料。"],
  ["antimony(III) oxide", "Sb2O3", "三氧化二锑", "含锑的无机氧化物。"],
  ["tellurium dioxide", "TeO2", "二氧化碲", "可用于特种玻璃的含碲氧化物。"],
  { query: "xenon difluoride", formula: "XeF2", name: "二氟化氙", feature: "具有线形结构的稀有气体化合物。", kind: "molecule" },
  ["cesium chloride", "CsCl", "氯化铯", "由铯和氯组成的离子晶体。"],
  ["barium sulfate", "BaSO4", "硫酸钡", "难溶的白色钡盐，可用于医学造影。"],
  ["lanthanum oxide", "La2O3", "氧化镧", "稀土元素镧的常见氧化物。"],
  ["cerium dioxide", "CeO2", "二氧化铈", "可用于抛光和催化材料。"],
  ["praseodymium(III) oxide", "Pr2O3", "三氧化二镨", "稀土元素镨的氧化物。"],
  ["neodymium(III) oxide", "Nd2O3", "三氧化二钕", "可用于玻璃着色和磁性材料。"],
  ["promethium(III) chloride", "PmCl3", "氯化钷", "含放射性钷的配方单元，仅作虚拟认识。"],
  ["samarium(III) oxide", "Sm2O3", "三氧化二钐", "稀土元素钐的常见氧化物。"],
  ["europium(III) oxide", "Eu2O3", "三氧化二铕", "发光材料中常见的含铕氧化物。"],
  ["gadolinium(III) oxide", "Gd2O3", "三氧化二钆", "含钆的稀土氧化物。"],
  ["terbium(III) oxide", "Tb2O3", "三氧化二铽", "稀土元素铽的氧化物。"],
  ["dysprosium(III) oxide", "Dy2O3", "三氧化二镝", "稀土元素镝的氧化物。"],
  ["holmium(III) oxide", "Ho2O3", "三氧化二钬", "稀土元素钬的氧化物。"],
  ["erbium(III) oxide", "Er2O3", "三氧化二铒", "可用于玻璃和光学材料。"],
  ["thulium(III) oxide", "Tm2O3", "三氧化二铥", "稀土元素铥的氧化物。"],
  ["ytterbium(III) oxide", "Yb2O3", "三氧化二镱", "稀土元素镱的常见氧化物。"],
  ["lutetium(III) oxide", "Lu2O3", "三氧化二镥", "稀土元素镥的氧化物。"],
  ["hafnium dioxide", "HfO2", "二氧化铪", "耐高温并可用于微电子材料。"],
  ["tantalum pentoxide", "Ta2O5", "五氧化二钽", "电容器和光学材料中的含钽氧化物。"],
  ["tungsten trioxide", "WO3", "三氧化钨", "可随电化学状态改变颜色的钨氧化物。"],
  ["rhenium(VII) oxide", "Re2O7", "七氧化二铼", "含铼的高价氧化物。"],
  { query: "osmium tetroxide", formula: "OsO4", name: "四氧化锇", feature: "剧毒且挥发的锇化合物，只作虚拟认识。", kind: "molecule" },
  ["iridium(IV) oxide", "IrO2", "二氧化铱", "导电的铱氧化物。"],
  ["platinum dioxide", "PtO2", "二氧化铂", "含铂和氧的无机化合物。"],
  ["gold(III) chloride", "AuCl3", "三氯化金", "含金和氯的无机配方单元。"],
  ["mercury(II) sulfide", "HgS", "硫化汞", "有毒的含汞矿物成分，只作虚拟认识。"],
].map((candidate) => Array.isArray(candidate)
  ? {
      query: candidate[0],
      formula: candidate[1],
      name: candidate[2],
      feature: candidate[3],
      kind: "formula-unit",
    }
  : candidate);

let lastRequestAt = 0;

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, attempts = 5) {
  const wait = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastRequestAt));
  if (wait > 0) await pause(wait);
  lastRequestAt = Date.now();
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MumuLearning/1.0 (local educational content generator)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.ok) return response.json();
  if (attempts > 1 && [429, 500, 502, 503, 504].includes(response.status)) {
    await pause((6 - attempts) * 1_000);
    return fetchJson(url, attempts - 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

function parseFormula(formula) {
  const counts = {};
  let cursor = 0;
  const matcher = /([A-Z][a-z]?)(\d*)/gu;
  for (const match of formula.matchAll(matcher)) {
    if (match.index !== cursor) return null;
    counts[match[1]] = (counts[match[1]] ?? 0) + Number(match[2] || 1);
    cursor = match.index + match[0].length;
  }
  return cursor === formula.length && cursor > 0 ? counts : null;
}

function sameCounts(first, second) {
  const symbols = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...symbols].every((symbol) => first[symbol] === second[symbol]);
}

function compositionLayout(formula) {
  const counts = parseFormula(formula);
  if (!counts) throw new Error(`无法解析配方：${formula}`);
  const symbols = Object.entries(counts).flatMap(([symbol, count]) => Array(count).fill(symbol));
  if (symbols.length === 1) return [{ symbol: symbols[0], x: 0, y: 0 }];
  const radius = symbols.length <= 3 ? 0.82 : 1.08;
  return symbols.map((symbol, index) => {
    const angle = -Math.PI / 2 + index / symbols.length * Math.PI * 2;
    return {
      symbol,
      x: Number((Math.cos(angle) * radius).toFixed(4)),
      y: Number((Math.sin(angle) * radius).toFixed(4)),
    };
  });
}

function isConnected(atomCount, bonds) {
  if (atomCount < 2 || bonds.length < atomCount - 1) return false;
  const neighbors = Array.from({ length: atomCount }, () => []);
  for (const bond of bonds) {
    neighbors[bond.from].push(bond.to);
    neighbors[bond.to].push(bond.from);
  }
  const visited = new Set([0]);
  const pending = [0];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const neighbor of neighbors[current]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
  }
  return visited.size === atomCount;
}

async function fetchPubChemTopology(cid, formula) {
  const url = new URL(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/JSON`);
  url.searchParams.set("record_type", "2d");
  const payload = await fetchJson(url);
  const compound = payload.PC_Compounds?.[0];
  const aids = compound?.atoms?.aid ?? [];
  const symbols = (compound?.atoms?.element ?? [])
    .map((atomicNumber) => ELEMENT_SYMBOL_BY_ATOMIC_NUMBER[atomicNumber]);
  const expectedCounts = parseFormula(formula);
  const actualCounts = symbols.reduce((counts, symbol) => {
    if (symbol) counts[symbol] = (counts[symbol] ?? 0) + 1;
    return counts;
  }, {});
  if (
    aids.length < 2
    || symbols.some((symbol) => !symbol)
    || !expectedCounts
    || !sameCounts(expectedCounts, actualCounts)
  ) {
    throw new Error(`PubChem CID ${cid} 的显式原子与 ${formula} 不一致`);
  }
  const coordinateSet = compound.coords?.find((coordinates) => (
    coordinates.aid?.length === aids.length
    && coordinates.conformers?.[0]?.x?.length === aids.length
    && coordinates.conformers?.[0]?.y?.length === aids.length
  ));
  if (!coordinateSet) throw new Error(`PubChem CID ${cid} 没有完整二维坐标`);
  const coordinates = coordinateSet.conformers[0];
  const coordinateByAid = new Map(coordinateSet.aid.map((aid, index) => [
    aid,
    { x: coordinates.x[index], y: coordinates.y[index] },
  ]));
  const indexByAid = new Map(aids.map((aid, index) => [aid, index]));
  const bondData = compound.bonds ?? { aid1: [], aid2: [], order: [] };
  const bonds = bondData.aid1.map((firstAid, index) => ({
    from: indexByAid.get(firstAid),
    to: indexByAid.get(bondData.aid2[index]),
    order: bondData.order[index],
  }));
  if (
    bonds.some((bond) => (
      bond.from === undefined
      || bond.to === undefined
      || ![1, 2, 3].includes(bond.order)
    ))
    || !isConnected(aids.length, bonds)
  ) {
    throw new Error(`PubChem CID ${cid} 没有单一连通的明确键拓扑`);
  }
  const rawAtoms = aids.map((aid, index) => ({
    symbol: symbols[index],
    x: coordinateByAid.get(aid).x,
    y: coordinateByAid.get(aid).y,
  }));
  const centerX = rawAtoms.reduce((total, atom) => total + atom.x, 0) / rawAtoms.length;
  const centerY = rawAtoms.reduce((total, atom) => total + atom.y, 0) / rawAtoms.length;
  const bondLengths = bonds
    .map((bond) => {
      const first = rawAtoms[bond.from];
      const second = rawAtoms[bond.to];
      return Math.hypot(second.x - first.x, second.y - first.y);
    })
    .sort((first, second) => first - second);
  const medianBondLength = bondLengths[Math.floor(bondLengths.length / 2)];
  if (!medianBondLength) throw new Error(`PubChem CID ${cid} 的键长无效`);
  return {
    atoms: rawAtoms.map((atom) => ({
      symbol: atom.symbol,
      x: Number(((atom.x - centerX) / medianBondLength).toFixed(4)),
      y: Number((-(atom.y - centerY) / medianBondLength).toFixed(4)),
    })),
    bonds,
  };
}

function normalizeCandidateFormula(formula) {
  return formula.replace(/[+-]\d*$/u, "").replace(/\s+/g, "");
}

async function resolvePubChem(candidate) {
  if (candidate.manualSource) return { source: candidate.manualSource };
  const nameUrl = new URL(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(candidate.query)}/property/MolecularFormula/JSON`,
  );
  let property;
  try {
    const payload = await fetchJson(nameUrl);
    property = payload.PropertyTable?.Properties?.[0];
  } catch (error) {
    if (!String(error).includes("404")) throw error;
  }
  if (!property) {
    const formulaUrl = new URL(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastformula/${encodeURIComponent(candidate.formula)}/cids/JSON`,
    );
    formulaUrl.searchParams.set("MaxRecords", "1");
    const formulaPayload = await fetchJson(formulaUrl);
    const cid = formulaPayload.IdentifierList?.CID?.[0];
    if (cid) property = { CID: cid, MolecularFormula: candidate.formula };
  }
  if (!property?.CID || !property.MolecularFormula) {
    throw new Error(`PubChem 没有返回 ${candidate.query} 的 CID 和分子式`);
  }
  const expected = parseFormula(candidate.formula);
  const actual = parseFormula(normalizeCandidateFormula(property.MolecularFormula));
  if (!expected || !actual || !sameCounts(expected, actual)) {
    throw new Error(
      `${candidate.query} 的 PubChem 分子式 ${property.MolecularFormula} 与 ${candidate.formula} 不一致`,
    );
  }
  return {
    cid: property.CID,
    source: {
      name: "PubChem",
      url: `https://pubchem.ncbi.nlm.nih.gov/compound/${property.CID}`,
    },
  };
}

async function main() {
  const records = [];
  for (const [index, candidate] of CANDIDATES.entries()) {
    const resolved = await resolvePubChem(candidate);
    const topology = candidate.manualTopology
      ?? (candidate.kind === "molecule" && resolved.cid
        ? await fetchPubChemTopology(resolved.cid, candidate.formula)
        : undefined);
    records.push({
      id: `element-compound-${candidate.formula.toLowerCase()}`,
      cid: resolved.cid,
      formula: candidate.formula,
      name: candidate.name,
      nameEnglish: candidate.query,
      feature: candidate.feature,
      family: "inorganic",
      kind: candidate.kind,
      representation: topology ? "authoritative-topology" : "composition-schematic",
      atoms: topology?.atoms ?? compositionLayout(candidate.formula),
      bonds: topology?.bonds ?? [],
      source: resolved.source,
    });
    if ((index + 1) % 10 === 0 || index + 1 === CANDIDATES.length) {
      console.log(`元素化合物核验 ${index + 1}/${CANDIDATES.length}`);
    }
  }

  const existingAsset = JSON.parse(
    await readFile(path.resolve(process.cwd(), "content/chemistry/molecular-structures.v1.json"), "utf8"),
  );
  const coveredSymbols = new Set([
    ...existingAsset.records.flatMap((record) => record.atoms.map((atom) => atom.symbol)),
    ...records.flatMap((record) => record.atoms.map((atom) => atom.symbol)),
  ]);
  const missingThrough80 = ELEMENT_SYMBOL_BY_ATOMIC_NUMBER
    .slice(1, 81)
    .filter((symbol) => !coveredSymbols.has(symbol));
  if (missingThrough80.length > 0) {
    throw new Error(`新增元素化合物仍缺少：${missingThrough80.join("、")}`);
  }

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    count: records.length,
    coverage: {
      atomicNumbers: "1-80",
      coveredElementCount: coveredSymbols.size,
      representationRule: "分子使用可追溯拓扑；离子晶体和固体只展示不虚构化学键的配方单元组成示意。",
    },
    sources: [
      {
        name: "PubChem PUG REST",
        url: "https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest",
        role: "核验化合物 CID 与分子式",
      },
      {
        name: "Nature Chemistry",
        url: "https://doi.org/10.1038/nchem.2716",
        role: "二钠氦化物高压结构来源",
      },
      {
        name: "Nature",
        url: "https://doi.org/10.1038/35022551",
        role: "氟氢化氩结构来源",
      },
      {
        name: "Angewandte Chemie International Edition",
        url: "https://doi.org/10.1002/anie.201205072",
        role: "氖—金—氟配合物来源",
      },
    ],
    records,
  };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`已生成 ${records.length} 种元素化合物，覆盖前 80 号元素。`);
}

await main();
