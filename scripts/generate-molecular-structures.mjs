import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TARGET_COUNT = 300;
const MAX_ATOMS = 36;
const LARGE_STRUCTURE_CIDS = new Set([123591]);
const MAX_WIKIPEDIA_CANDIDATES = 720;
const DEFAULT_REQUEST_GAP_MS = 260;
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "content/chemistry/molecular-structures.v1.json",
);

const ELEMENT_BY_ATOMIC_NUMBER = new Map([
  [1, "H"],
  [5, "B"],
  [6, "C"],
  [7, "N"],
  [8, "O"],
  [9, "F"],
  [14, "Si"],
  [15, "P"],
  [16, "S"],
  [17, "Cl"],
  [32, "Ge"],
  [33, "As"],
  [34, "Se"],
  [35, "Br"],
  [36, "Kr"],
  [53, "I"],
  [54, "Xe"],
]);

const CHILD_UNSUITABLE_NAME = /沙林|塔崩|黑索金|艾氏剂|安[殺杀]番|氯丹|狄氏剂|敌敌畏|毒死蜱|对硫磷|甲拌磷|久效磷|克百威|枯草隆|灭多威|百治磷|草[脫脱]净|残杀威|福美[雙双]/u;

const ESSENTIAL_MOLECULES = [
  ["molecular hydrogen", "氢气", "最轻的双原子分子，可作为燃料和化工原料。"],
  ["molecular nitrogen", "氮气", "空气的主要成分，两个氮原子之间具有三键。"],
  ["molecular oxygen", "氧气", "支持呼吸和燃烧的双原子分子。"],
  ["molecular fluorine", "氟气", "反应性极强的双原子分子，仅作虚拟观察。"],
  ["molecular chlorine", "氯气", "黄绿色且有毒的双原子分子，仅作虚拟观察。"],
  ["molecular bromine", "溴", "常温下呈红棕色液体的双原子物质。"],
  ["molecular iodine", "碘", "受热容易形成紫色蒸气的双原子物质。"],
  ["water", "水", "一个氧原子与两个氢原子通过共价键连接。"],
  ["hydrogen peroxide", "过氧化氢", "两个氧原子之间含有单键的氧化性分子。"],
  ["ammonia", "氨", "由一个氮原子和三个氢原子组成，是重要化工原料。"],
  ["carbon monoxide", "一氧化碳", "由碳和氧组成的有毒气体分子。"],
  ["carbon dioxide", "二氧化碳", "线形分子，是光合作用原料和温室气体。"],
  ["ozone", "臭氧", "由三个氧原子组成，在高层大气中吸收紫外线。"],
  ["nitric oxide", "一氧化氮", "由氮和氧组成，也能参与生物信号传递。"],
  ["nitrogen dioxide", "二氧化氮", "棕红色有毒气体，仅作虚拟观察。"],
  ["nitrous oxide", "一氧化二氮", "由两个氮原子和一个氧原子组成。"],
  ["sulfur dioxide", "二氧化硫", "弯曲形分子，是有刺激性的含硫气体。"],
  ["sulfur trioxide", "三氧化硫", "硫酸工业中的重要分子，仅作虚拟观察。"],
  ["hydrogen sulfide", "硫化氢", "有毒且有刺激性气味的含硫分子。"],
  ["hydrogen chloride", "氯化氢", "溶于水形成盐酸的双原子分子。"],
  ["hydrogen fluoride", "氟化氢", "腐蚀性很强的双原子分子，仅作虚拟观察。"],
  ["hydrogen bromide", "溴化氢", "由氢和溴组成的双原子分子。"],
  ["hydrogen iodide", "碘化氢", "由氢和碘组成的双原子分子。"],
  ["hypochlorous acid", "次氯酸", "具有氧化能力的弱酸分子。"],
  ["carbonic acid", "碳酸", "二氧化碳溶于水时可形成的弱酸分子。"],
  ["nitric acid", "硝酸", "重要强酸和氧化剂，仅作虚拟观察。"],
  ["sulfuric acid", "硫酸", "重要工业强酸，仅作虚拟观察。"],
  ["phosphoric acid", "磷酸", "含磷的三元酸，也存在于许多生物过程。"],
  ["boric acid", "硼酸", "弱酸分子，可用于玻璃和陶瓷材料。"],
  ["silane", "硅烷", "结构与甲烷相似的含硅分子。"],
  ["phosphine", "磷化氢", "有毒且可燃的含磷分子，仅作虚拟观察。"],
  ["acetylene", "乙炔", "两个碳原子以三键连接，两端各连接一个氢原子。"],
  ["ethylene", "乙烯", "两个碳原子以双键连接，是重要化工原料。"],
  ["ethane", "乙烷", "两个碳原子以单键连接的简单烷烃。"],
  ["propane", "丙烷", "三个碳原子组成的直链烷烃。"],
  ["n-butane", "正丁烷", "四个碳原子组成的直链烷烃。"],
  ["methanol", "甲醇", "最简单的醇，有毒且可燃，仅作虚拟观察。"],
  ["ethanol", "乙醇", "含羟基的两碳有机分子。"],
  ["formaldehyde", "甲醛", "最简单的醛，有刺激性，仅作虚拟观察。"],
  ["acetone", "丙酮", "常见的三碳酮类分子。"],
  ["acetic acid", "乙酸", "食醋酸味的主要来源。"],
  ["benzene", "苯", "六个碳原子形成稳定芳香环，有毒且易燃。"],
  ["toluene", "甲苯", "苯环连接一个甲基的芳香族分子。"],
  ["cyclopropane", "环丙烷", "三个碳原子形成小环的烃类分子。"],
  ["cyclobutane", "环丁烷", "四个碳原子形成环状骨架。"],
  ["cyclopentane", "环戊烷", "五个碳原子形成环状骨架。"],
  ["cyclohexane", "环己烷", "六个碳原子形成非芳香环状骨架。"],
  ["propyne", "丙炔", "含有碳碳三键的三碳分子。"],
  ["1-butyne", "1-丁炔", "三键位于碳链末端的四碳分子。"],
  ["propene", "丙烯", "含有一个碳碳双键的三碳分子。"],
  ["1-butene", "1-丁烯", "双键位于碳链末端的四碳分子。"],
  ["dimethyl ether", "二甲醚", "一个氧原子连接两个甲基的醚类分子。"],
  ["diethyl ether", "乙醚", "一个氧原子连接两个乙基的醚类分子。"],
  ["ethylene glycol", "乙二醇", "含有两个羟基的两碳分子。"],
  ["glycerol", "甘油", "含有三个羟基的三碳分子。"],
  ["urea", "尿素", "生命代谢和肥料中常见的含氮分子。"],
  ["thiourea", "硫脲", "尿素中的氧被硫替代形成的含硫分子。"],
  ["pyridine", "吡啶", "六元芳香环中含有一个氮原子。"],
  ["pyrrole", "吡咯", "五元芳香环中含有一个氮原子。"],
  ["furan", "呋喃", "五元芳香环中含有一个氧原子。"],
  ["thiophene", "噻吩", "五元芳香环中含有一个硫原子。"],
  ["imidazole", "咪唑", "五元芳香环中含有两个氮原子。"],
  ["pyrazole", "吡唑", "相邻两个氮原子位于五元芳香环中。"],
  ["D-glucose", "D-葡萄糖", "细胞常用的能量分子。"],
  ["D-fructose", "D-果糖", "水果和蜂蜜中常见的单糖。"],
  ["sucrose", "蔗糖", "由两个单糖单元连接形成的食糖分子。"],
  ["caffeine", "咖啡因", "茶和咖啡中常见的含氮有机分子。"],
  ["aspirin", "阿司匹林", "常见药物分子乙酰水杨酸。"],
  ["acetaminophen", "对乙酰氨基酚", "常见解热镇痛药物分子。"],
  ["dopamine", "多巴胺", "参与运动、学习和奖励的神经递质。"],
  ["epinephrine", "肾上腺素", "参与应激反应的生物信号分子。"],
  ["fullerene C60", "富勒烯 C60", "六十个碳原子连接成封闭的足球形碳笼。"],
];

const lastRequestByHost = new Map();

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url, attempts = 6) {
  const hostname = url.hostname;
  const requestGap = hostname === "www.wikidata.org" ? 1_050 : DEFAULT_REQUEST_GAP_MS;
  const lastRequestAt = lastRequestByHost.get(hostname) ?? 0;
  const wait = Math.max(0, requestGap - (Date.now() - lastRequestAt));
  if (wait > 0) await pause(wait);
  lastRequestByHost.set(hostname, Date.now());

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MumuLearning/1.0 (local educational content generator)",
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (attempts > 1) {
      await pause((7 - attempts) * 1_200);
      return fetchJson(url, attempts - 1);
    }
    throw error;
  }
  if (response.ok) return response.json();
  if (attempts > 1 && [429, 500, 502, 503, 504].includes(response.status)) {
    const retryAfter = Number(response.headers.get("retry-after"));
    await pause(Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(10_000, retryAfter * 1_000)
      : (7 - attempts) * 1_500);
    return fetchJson(url, attempts - 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function selectPubChemClaim(entity) {
  const claims = (entity.claims?.P662 ?? [])
    .filter((claim) => (
      claim.rank !== "deprecated"
      && claim.mainsnak?.snaktype === "value"
      && /^\d+$/.test(String(claim.mainsnak.datavalue?.value ?? ""))
    ))
    .sort((first, second) => (
      Number(second.rank === "preferred") - Number(first.rank === "preferred")
    ));
  return claims[0] ? Number(claims[0].mainsnak.datavalue.value) : null;
}

async function fetchWikipediaCandidates() {
  const byEntityId = new Map();
  let continuation = {};
  do {
    const url = new URL("https://zh.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "links");
    url.searchParams.set("titles", "有机化合物列表");
    url.searchParams.set("gplnamespace", "0");
    url.searchParams.set("gpllimit", "max");
    url.searchParams.set("prop", "pageprops");
    url.searchParams.set("ppprop", "wikibase_item");
    url.searchParams.set("redirects", "1");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    for (const [key, value] of Object.entries(continuation)) {
      url.searchParams.set(key, String(value));
    }
    const payload = await fetchJson(url);
    for (const page of payload.query?.pages ?? []) {
      const entityId = page.pageprops?.wikibase_item;
      if (entityId) {
        byEntityId.set(entityId, { title: page.title });
      }
    }
    continuation = payload.continue ?? {};
  } while (Object.keys(continuation).length > 0);

  const candidates = [];
  const entityBatches = chunks([...byEntityId.keys()], 35);
  for (const [batchIndex, entityIds] of entityBatches.entries()) {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.searchParams.set("action", "wbgetentities");
    url.searchParams.set("ids", entityIds.join("|"));
    url.searchParams.set("props", "claims|labels|descriptions");
    url.searchParams.set("languages", "zh|en");
    url.searchParams.set("languagefallback", "1");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    const payload = await fetchJson(url);
    for (const entity of Object.values(payload.entities ?? {})) {
      const cid = selectPubChemClaim(entity);
      const page = byEntityId.get(entity.id);
      const nameZh = page?.title ?? entity.labels?.zh?.value;
      if (!cid || !nameZh) continue;
      const description = entity.descriptions?.zh?.value;
      candidates.push({
        cid,
        nameZh,
        nameEn: entity.labels?.en?.value ?? "",
        description: description && description !== "化合物" && description !== "有機化合物"
          ? description
          : "",
        popularity: 0,
        wikidataId: entity.id,
        wikipediaTitle: page?.title ?? nameZh,
        priority: false,
      });
    }
    if ((batchIndex + 1) % 8 === 0 || batchIndex + 1 === entityBatches.length) {
      console.log(`Wikidata 名称核对 ${batchIndex + 1}/${entityBatches.length}`);
    }
  }
  return candidates.sort((first, second) => (
    first.nameZh.length - second.nameZh.length
    || first.nameZh.localeCompare(second.nameZh, "zh-CN")
  ));
}

async function fetchEssentialCandidates() {
  const candidates = [];
  for (const [index, [query, nameZh, description]] of ESSENTIAL_MOLECULES.entries()) {
    const url = new URL(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/cids/JSON`,
    );
    const payload = await fetchJson(url);
    const cid = payload.IdentifierList?.CID?.[0];
    if (!cid) continue;
    candidates.push({
      cid,
      nameZh,
      nameEn: query,
      description,
      popularity: Number.MAX_SAFE_INTEGER,
      priority: true,
    });
    if ((index + 1) % 15 === 0 || index + 1 === ESSENTIAL_MOLECULES.length) {
      console.log(`基础分子核对 ${index + 1}/${ESSENTIAL_MOLECULES.length}`);
    }
  }
  return candidates;
}

function propertyValue(compound, label, name) {
  return compound.props?.find((property) => (
    property.urn?.label === label
    && (name === undefined || property.urn?.name === name)
  ))?.value?.sval;
}

function parseSimpleFormula(formula) {
  const normalized = formula.replace(/[+-]\d*$/u, "");
  const counts = {};
  let cursor = 0;
  const matcher = /([A-Z][a-z]?)(\d*)/gu;
  for (const match of normalized.matchAll(matcher)) {
    if (match.index !== cursor) return null;
    counts[match[1]] = (counts[match[1]] ?? 0) + Number(match[2] || 1);
    cursor = match.index + match[0].length;
  }
  return cursor === normalized.length && cursor > 0 ? counts : null;
}

function countSymbols(symbols) {
  const counts = {};
  for (const symbol of symbols) counts[symbol] = (counts[symbol] ?? 0) + 1;
  return counts;
}

function sameCounts(first, second) {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...keys].every((key) => first[key] === second[key]);
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

function buildStructure(compound, candidate) {
  if (compound.charge !== 0 || compound.atoms?.isotope) return null;
  const aids = compound.atoms?.aid ?? [];
  const symbols = (compound.atoms?.element ?? [])
    .map((atomicNumber) => ELEMENT_BY_ATOMIC_NUMBER.get(atomicNumber));
  if (
    aids.length < 2
    || (aids.length > MAX_ATOMS && !LARGE_STRUCTURE_CIDS.has(candidate.cid))
    || symbols.length !== aids.length
    || symbols.some((symbol) => !symbol)
  ) {
    return null;
  }

  const coordinateSet = compound.coords?.find((coordinates) => (
    coordinates.aid?.length === aids.length
    && coordinates.conformers?.[0]?.x?.length === aids.length
    && coordinates.conformers?.[0]?.y?.length === aids.length
  ));
  if (!coordinateSet) return null;
  const xValues = coordinateSet.conformers[0].x;
  const yValues = coordinateSet.conformers[0].y;
  const coordinateByAid = new Map(
    coordinateSet.aid.map((aid, index) => [aid, { x: xValues[index], y: yValues[index] }]),
  );
  if (aids.some((aid) => !coordinateByAid.has(aid))) return null;

  const indexByAid = new Map(aids.map((aid, index) => [aid, index]));
  const bondData = compound.bonds ?? { aid1: [], aid2: [], order: [] };
  if (
    bondData.aid1.length !== bondData.aid2.length
    || bondData.aid1.length !== bondData.order.length
    || bondData.order.some((order) => ![1, 2, 3].includes(order))
  ) {
    return null;
  }
  const bonds = bondData.aid1.map((firstAid, index) => ({
    from: indexByAid.get(firstAid),
    to: indexByAid.get(bondData.aid2[index]),
    order: bondData.order[index],
  }));
  if (bonds.some((bond) => bond.from === undefined || bond.to === undefined || bond.from === bond.to)) {
    return null;
  }
  if (!isConnected(aids.length, bonds)) return null;

  const formula = propertyValue(compound, "Molecular Formula");
  const formulaCounts = formula ? parseSimpleFormula(formula) : null;
  const symbolCounts = countSymbols(symbols);
  if (!formula || !formulaCounts || !sameCounts(formulaCounts, symbolCounts)) return null;

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
    .filter((length) => length > 0.001)
    .sort((first, second) => first - second);
  const medianBondLength = bondLengths[Math.floor(bondLengths.length / 2)];
  if (!medianBondLength) return null;

  const atoms = rawAtoms.map((atom) => ({
    symbol: atom.symbol,
    x: Number(((atom.x - centerX) / medianBondLength).toFixed(4)),
    y: Number((-(atom.y - centerY) / medianBondLength).toFixed(4)),
  }));
  const elementNames = [...new Set(symbols)].join("、");
  const feature = candidate.description
    ? `${candidate.description.replace(/[。；;]+$/u, "")}。`
    : `由 ${elementNames} 元素组成，二维连接结构已由 PubChem 标准化记录确认。`;

  return {
    id: `pubchem-${candidate.cid}`,
    cid: candidate.cid,
    formula,
    name: candidate.nameZh,
    nameEnglish: candidate.nameEn || propertyValue(compound, "IUPAC Name", "Preferred") || "",
    feature,
    atoms,
    bonds,
    source: {
      name: "PubChem",
      url: `https://pubchem.ncbi.nlm.nih.gov/compound/${candidate.cid}`,
      wikidataId: candidate.wikidataId,
      wikipediaTitle: candidate.wikipediaTitle,
    },
  };
}

async function fetchStructures(candidates) {
  const compoundByCid = new Map();
  const candidateBatches = chunks(candidates, 24);
  for (const [batchIndex, candidateBatch] of candidateBatches.entries()) {
    const ids = candidateBatch.map((candidate) => candidate.cid);
    const url = new URL(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${ids.join(",")}/JSON`,
    );
    url.searchParams.set("record_type", "2d");
    const payload = await fetchJson(url);
    for (const compound of payload.PC_Compounds ?? []) {
      const cid = compound.id?.id?.cid;
      if (cid) compoundByCid.set(cid, compound);
    }
    if ((batchIndex + 1) % 5 === 0 || batchIndex + 1 === candidateBatches.length) {
      console.log(`PubChem 拓扑读取 ${batchIndex + 1}/${candidateBatches.length}`);
    }
  }
  return compoundByCid;
}

async function main() {
  console.log("正在读取中文维基常见有机化合物候选……");
  const essentialCandidates = await fetchEssentialCandidates();
  const wikipediaCandidates = await fetchWikipediaCandidates();
  const candidateByCid = new Map();
  for (const candidate of wikipediaCandidates.slice(0, MAX_WIKIPEDIA_CANDIDATES)) {
    if (!candidateByCid.has(candidate.cid)) candidateByCid.set(candidate.cid, candidate);
  }
  for (const candidate of essentialCandidates) candidateByCid.set(candidate.cid, candidate);
  const candidates = [...candidateByCid.values()].sort((first, second) => (
    Number(second.priority) - Number(first.priority)
    || second.popularity - first.popularity
  ));

  console.log(`正在核验 ${candidates.length} 个 PubChem 二维结构记录……`);
  const compoundByCid = await fetchStructures(candidates);
  const accepted = [];
  for (const candidate of candidates) {
    if (CHILD_UNSUITABLE_NAME.test(candidate.nameZh)) continue;
    const compound = compoundByCid.get(candidate.cid);
    if (!compound) continue;
    const structure = buildStructure(compound, candidate);
    if (structure) accepted.push(structure);
    if (accepted.length === TARGET_COUNT) break;
  }
  if (accepted.length < TARGET_COUNT) {
    throw new Error(`仅获得 ${accepted.length} 个可验证结构，未达到 ${TARGET_COUNT} 个目标。`);
  }

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    count: accepted.length,
    selection: {
      targetCount: TARGET_COUNT,
      maximumAtomsPerMolecule: MAX_ATOMS,
      largeStructureExceptions: [{ cid: 123591, name: "富勒烯 C60", atoms: 60 }],
      candidateList: "中文维基百科《有机化合物列表》及基础小分子白名单",
      structureAuthority: "PubChem Compound 2D standardized records",
      filters: [
        "总电荷为 0",
        "仅含受支持的非金属或类金属元素",
        "通常为 2 至 36 个显式原子；C60 作为已核验碳笼特例保留",
        "分子式与显式原子逐项一致",
        "全部原子具有二维坐标",
        "全部原子属于单一连通共价网络",
        "键级仅为单键、双键或三键",
        "不适合儿童随机学习的神经毒剂、爆炸物和农药名称被排除",
      ],
    },
    sources: [
      {
        name: "PubChem",
        url: "https://pubchem.ncbi.nlm.nih.gov/docs/structures",
        role: "标准化原子、二维坐标、连接关系和键级",
      },
      {
        name: "中文维基百科：有机化合物列表",
        url: "https://zh.wikipedia.org/wiki/有机化合物列表",
        role: "常见物质候选范围",
      },
      {
        name: "Wikidata",
        url: "https://www.wikidata.org/",
        role: "中文名称、PubChem CID 对照和简短说明",
      },
    ],
    records: accepted,
  };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`已生成 ${accepted.length} 个经 PubChem 拓扑核验的分子结构。`);
}

await main();
