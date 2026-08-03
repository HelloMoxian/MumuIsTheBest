import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "content/chemistry/curriculum-compounds.v1.json",
);
const REQUEST_GAP_MS = 260;

const ELEMENT_SYMBOL_BY_ATOMIC_NUMBER = [
  "", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K",
  "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y",
  "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr",
  "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
  "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
  "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
];

function candidate(query, formula, name, feature, category, options = {}) {
  return {
    query,
    formula,
    name,
    feature,
    category,
    family: options.family ?? "inorganic",
    kind: options.kind ?? (formula.includes("·") ? "hydrate" : "formula-unit"),
    curriculumPriority: options.curriculumPriority ?? 2,
  };
}

// These are the inorganic substances used by the existing 165-reaction
// conservation library that were not already represented in the furnace.
const REACTION_CANDIDATES = [
  ["ammonium sulfate", "(NH4)2SO4", "硫酸铵", "常见氮肥，也是认识铵盐反应的代表物。", "salt"],
  ["silver carbonate", "Ag2CO3", "碳酸银", "浅黄色、难溶的银盐，只作虚拟认识。", "salt"],
  ["silver oxide", "Ag2O", "氧化银", "受热或见光可分解的银氧化物。", "oxide"],
  ["silver bromide", "AgBr", "溴化银", "具有感光性的淡黄色银盐。", "salt"],
  ["silver nitrate", "AgNO3", "硝酸银", "检验卤离子和观察置换反应时常见的银盐。", "salt"],
  ["aluminium hydroxide", "Al(OH)3", "氢氧化铝", "白色胶状沉淀，具有两性。", "base"],
  ["aluminium sulfate", "Al2(SO4)3", "硫酸铝", "水处理和复分解反应中常见的铝盐。", "salt"],
  ["aluminium chloride", "AlCl3", "氯化铝", "由铝和氯组成的常见铝盐。", "salt"],
  ["barium nitrate", "Ba(NO3)2", "硝酸钡", "可提供钡离子的可溶性盐，只作受控认识。", "salt"],
  ["barium hydroxide", "Ba(OH)2", "氢氧化钡", "可溶性强碱，页面只用于认识组成。", "base"],
  ["barium chloride", "BaCl2", "氯化钡", "检验硫酸根时常见的钡盐，有毒不可接触。", "salt"],
  ["1,2-dibromoethane", "C2H4Br2", "1,2-二溴乙烷", "乙烯与溴加成后的代表性有机产物。", "other", { family: "organic", kind: "molecule" }],
  ["1,2-dichloroethane", "C2H4Cl2", "1,2-二氯乙烷", "乙烯与氯加成后的代表性有机产物。", "other", { family: "organic", kind: "molecule" }],
  ["calcium nitrate", "Ca(NO3)2", "硝酸钙", "含钙和硝酸根的常见盐。", "salt"],
  ["calcium hydroxide", "Ca(OH)2", "氢氧化钙", "熟石灰，澄清溶液常称石灰水。", "base"],
  ["calcium phosphate", "Ca3(PO4)2", "磷酸钙", "难溶的钙盐，骨骼矿物中也有相关钙磷结构。", "salt"],
  ["calcium carbide", "CaC2", "碳化钙", "俗称电石，遇水反应剧烈，只作虚拟认识。", "salt"],
  ["calcium chloride", "CaCl2", "氯化钙", "常见吸湿性钙盐，也可用于融雪。", "salt"],
  ["calcium carbonate", "CaCO3", "碳酸钙", "石灰石、大理石和贝壳的主要成分。", "salt"],
  ["calcium metasilicate", "CaSiO3", "硅酸钙", "水泥和硅酸盐材料中的代表性配方。", "salt"],
  ["calcium sulfite", "CaSO3", "亚硫酸钙", "烟气脱硫过程里可出现的钙盐。", "salt"],
  ["carbon disulfide", "CS2", "二硫化碳", "线形分子，易燃且有毒，只作虚拟认识。", "other", { kind: "molecule" }],
  ["copper nitrate", "Cu(NO3)2", "硝酸铜", "含铜离子和硝酸根的蓝色铜盐。", "salt"],
  ["copper hydroxide", "Cu(OH)2", "氢氧化铜", "蓝色沉淀，受热会变成黑色氧化铜。", "base"],
  ["basic copper carbonate", "Cu2(OH)2CO3", "碱式碳酸铜", "绿色固体，是孔雀石的主要成分之一。", "salt"],
  ["copper(I) oxide", "Cu2O", "氧化亚铜", "红色的低价铜氧化物。", "oxide"],
  ["copper chloride", "CuCl2", "氯化铜", "常见铜盐，水溶液常呈蓝绿色。", "salt"],
  ["copper sulfate", "CuSO4", "硫酸铜", "无水硫酸铜呈白色，遇水会形成蓝色水合物。", "salt"],
  ["iron(II) hydroxide", "Fe(OH)2", "氢氧化亚铁", "浅绿色沉淀，接触空气后会继续变化。", "base"],
  ["iron(III) hydroxide", "Fe(OH)3", "氢氧化铁", "红棕色沉淀，是常见的铁化合物。", "base"],
  ["iron(III) sulfate", "Fe2(SO4)3", "硫酸铁", "含三价铁离子的硫酸盐。", "salt"],
  ["magnetite", "Fe3O4", "四氧化三铁", "黑色且有磁性的铁氧化物。", "oxide"],
  ["iron(II) chloride", "FeCl2", "氯化亚铁", "含二价铁离子的浅绿色铁盐。", "salt"],
  ["iron(III) chloride", "FeCl3", "氯化铁", "含三价铁离子的黄棕色铁盐。", "salt"],
  ["iron disulfide", "FeS2", "二硫化铁", "黄铁矿的主要成分，不是黄金。", "salt"],
  ["iron(II) sulfate", "FeSO4", "硫酸亚铁", "含二价铁离子的铁盐，水合晶体常呈浅绿色。", "salt"],
  ["mercury(II) oxide", "HgO", "氧化汞", "有毒汞化合物，只用于历史与守恒认识。", "oxide"],
  ["potassium carbonate", "K2CO3", "碳酸钾", "常见钾盐，水溶液呈碱性。", "salt"],
  ["potassium manganate", "K2MnO4", "锰酸钾", "绿色的含锰高价盐。", "salt"],
  ["potassium oxide", "K2O", "氧化钾", "活泼的碱性氧化物，只作组成认识。", "oxide"],
  ["potassium sulfate", "K2SO4", "硫酸钾", "常见的含钾肥料之一。", "salt"],
  ["potassium bromide", "KBr", "溴化钾", "由钾离子和溴离子组成的盐。", "salt"],
  ["potassium chlorate", "KClO3", "氯酸钾", "受控加热可放出氧气，绝不可自行实验。", "salt"],
  ["potassium iodide", "KI", "碘化钾", "由钾离子和碘离子组成的盐。", "salt"],
  ["potassium permanganate", "KMnO4", "高锰酸钾", "紫黑色晶体，是教材中常见的强氧化性盐。", "salt"],
  ["potassium nitrate", "KNO3", "硝酸钾", "常见硝酸盐和钾肥成分。", "salt"],
  ["potassium superoxide", "KO2", "超氧化钾", "含超氧根的钾化合物，只作虚拟认识。", "oxide"],
  ["potassium hydroxide", "KOH", "氢氧化钾", "强碱，具有腐蚀性，页面只展示组成。", "base"],
  ["lithium hydroxide", "LiOH", "氢氧化锂", "可吸收二氧化碳的碱性物质。", "base"],
  ["magnesium hydroxide", "Mg(OH)2", "氢氧化镁", "白色难溶碱，也是部分抗酸剂的成分。", "base"],
  ["magnesium chloride", "MgCl2", "氯化镁", "海水和盐湖中常见的镁盐。", "salt"],
  ["magnesium carbonate", "MgCO3", "碳酸镁", "白色镁盐，受热会分解。", "salt"],
  ["magnesium sulfate", "MgSO4", "硫酸镁", "常见镁盐，水合物俗称泻盐。", "salt"],
  ["manganese chloride", "MnCl2", "氯化锰", "含二价锰离子的锰盐。", "salt"],
  ["dinitrogen pentoxide", "N2O5", "五氧化二氮", "硝酸对应的酸性氧化物。", "oxide", { kind: "molecule" }],
  ["sodium carbonate", "Na2CO3", "碳酸钠（苏打）", "俗称苏打或纯碱，是生活中常见的盐。", "salt"],
  ["sodium oxide", "Na2O", "氧化钠", "碱性氧化物，与水作用形成氢氧化钠。", "oxide"],
  ["sodium peroxide", "Na2O2", "过氧化钠", "淡黄色过氧化物，只作虚拟认识。", "oxide"],
  ["sodium sulfide", "Na2S", "硫化钠", "遇酸可能放出有毒气体，只作理论认识。", "salt"],
  ["sodium sulfite", "Na2SO3", "亚硫酸钠", "可与酸反应放出二氧化硫。", "salt"],
  ["sodium sulfate", "Na2SO4", "硫酸钠", "常见的钠盐。", "salt"],
  ["sodium phosphate", "Na3PO4", "磷酸钠", "由钠离子和磷酸根组成的盐。", "salt"],
  ["sodium bicarbonate", "NaHCO3", "碳酸氢钠（小苏打）", "俗称小苏打，受热或遇酸会放出二氧化碳。", "salt"],
  ["sodium azide", "NaN3", "叠氮化钠", "可快速产生氮气的有毒物质，只作安全装置原理认识。", "salt"],
  ["sodium nitrate", "NaNO3", "硝酸钠", "常见硝酸盐。", "salt"],
  ["sodium hydroxide", "NaOH", "氢氧化钠", "俗称烧碱或苛性钠，是强腐蚀性强碱。", "base"],
  ["ammonium chloride", "NH4Cl", "氯化铵", "常见铵盐和氮肥。", "salt"],
  ["ammonium bicarbonate", "NH4HCO3", "碳酸氢铵", "受热易分解的铵态氮肥。", "salt"],
  ["white phosphorus", "P4", "白磷（P₄）", "由四个磷原子组成的分子，有毒且易燃。", "simple-substance", { kind: "molecule" }],
  ["phosphorus pentoxide", "P4O10", "十氧化四磷", "常写经验式 P₂O₅，是磷燃烧的重要产物。", "oxide", { kind: "molecule" }],
  ["lead nitrate", "Pb(NO3)2", "硝酸铅", "有毒铅盐，只用于沉淀反应的虚拟认识。", "salt"],
  ["lead iodide", "PbI2", "碘化铅", "黄色沉淀，有毒，只作虚拟认识。", "salt"],
  ["lead(II) oxide", "PbO", "氧化铅", "有毒铅氧化物，只作虚拟认识。", "oxide"],
  ["lead dioxide", "PbO2", "二氧化铅", "铅蓄电池相关材料，有毒，只作虚拟认识。", "oxide"],
  ["lead sulfate", "PbSO4", "硫酸铅", "难溶铅盐，有毒，只作虚拟认识。", "salt"],
  ["silicon dioxide", "SiO2", "二氧化硅", "石英和沙子的主要成分，是网络结构固体。", "oxide"],
  ["zinc nitrate", "Zn(NO3)2", "硝酸锌", "含锌离子和硝酸根的锌盐。", "salt"],
  ["zinc hydroxide", "Zn(OH)2", "氢氧化锌", "白色两性氢氧化物。", "base"],
  ["zinc chloride", "ZnCl2", "氯化锌", "吸湿性较强的锌盐。", "salt"],
  ["zinc sulfate", "ZnSO4", "硫酸锌", "常见锌盐。", "salt"],
].map((entry) => candidate(...entry));

const SUPPLEMENT_CANDIDATES = [
  ["nitrous acid", "HNO2", "亚硝酸", "不稳定的弱酸，只作组成和反应认识。", "acid", { kind: "molecule" }],
  ["sulfurous acid", "H2SO3", "亚硫酸", "二氧化硫溶于水时涉及的弱酸。", "acid", { kind: "molecule" }],
  ["chloric acid", "HClO3", "氯酸", "含氯的强酸和氧化性物质，只作虚拟认识。", "acid", { kind: "molecule" }],
  ["perchloric acid", "HClO4", "高氯酸", "强酸且危险，只用于认识含氧酸的组成。", "acid", { kind: "molecule" }],
  ["metasilicic acid", "H2SiO3", "硅酸", "常用来表示硅酸盐遇酸形成的胶状含硅物质。", "acid"],
  ["copper sulfate pentahydrate", "CuSO4·5H2O", "五水硫酸铜", "蓝色晶体，俗称胆矾或蓝矾。", "salt"],
  ["sodium carbonate decahydrate", "Na2CO3·10H2O", "十水碳酸钠", "俗称晶碱，是带结晶水的苏打。", "salt"],
  ["iron(II) sulfate heptahydrate", "FeSO4·7H2O", "七水硫酸亚铁", "浅绿色晶体，俗称绿矾。", "salt"],
  ["magnesium sulfate heptahydrate", "MgSO4·7H2O", "七水硫酸镁", "无色晶体，俗称泻盐。", "salt"],
  ["cobalt chloride hexahydrate", "CoCl2·6H2O", "六水氯化钴", "含结晶水的钴盐，颜色会随水合状态变化。", "salt", { curriculumPriority: 1 }],
  ["nickel sulfate hexahydrate", "NiSO4·6H2O", "六水硫酸镍", "绿色水合镍盐，有毒，只作虚拟认识。", "salt", { curriculumPriority: 1 }],
  ["calcium sulfate dihydrate", "CaSO4·2H2O", "二水硫酸钙", "石膏的主要成分。", "salt"],
  ["potassium alum", "AlK(SO4)2·12H2O", "十二水硫酸铝钾", "常称明矾，是常见的复盐水合物。", "salt"],
  ["borax decahydrate", "Na2B4O7·10H2O", "十水四硼酸钠", "俗称硼砂，页面只作组成认识。", "salt"],
  ["ammonium nitrate", "NH4NO3", "硝酸铵", "常见氮肥和强氧化性盐，绝不可自行加热。", "salt"],
  ["ammonium dihydrogen phosphate", "NH4H2PO4", "磷酸二氢铵", "常见复合肥料成分。", "salt"],
  ["diammonium hydrogen phosphate", "(NH4)2HPO4", "磷酸氢二铵", "含氮和磷的肥料成分。", "salt"],
  ["sodium hypochlorite", "NaClO", "次氯酸钠", "含氯消毒剂的有效成分之一，不能与酸混用。", "salt"],
  ["calcium hypochlorite", "Ca(ClO)2", "次氯酸钙", "漂白粉有效成分之一，只作安全认识。", "salt"],
  ["sodium thiosulfate", "Na2S2O3", "硫代硫酸钠", "常用于除去余氯，水合晶体俗称海波。", "salt"],
  ["potassium dichromate", "K2Cr2O7", "重铬酸钾", "橙色强氧化性铬盐，有毒，只作虚拟认识。", "salt"],
  ["potassium chromate", "K2CrO4", "铬酸钾", "黄色铬酸盐，有毒，只作虚拟认识。", "salt"],
  ["manganese sulfate", "MnSO4", "硫酸锰", "含二价锰离子的锰盐。", "salt", { curriculumPriority: 1 }],
].map((entry) => candidate(...entry));

// Give later metals a non-oxide partner so their random choices are not
// dominated by the one oxide used for elemental coverage.
const LATER_METAL_CANDIDATES = [
  ["scandium chloride", "ScCl3", "氯化钪", "含钪的卤化物配方单元。", "salt"],
  ["titanium tetrachloride", "TiCl4", "四氯化钛", "可挥发的钛化合物，遇水反应，只作虚拟认识。", "salt", { kind: "molecule" }],
  ["vanadium trichloride", "VCl3", "三氯化钒", "含三价钒的卤化物。", "salt"],
  ["chromium(III) chloride", "CrCl3", "氯化铬", "含三价铬的卤化物。", "salt"],
  ["gallium trichloride", "GaCl3", "三氯化镓", "含镓的卤化物。", "salt"],
  ["germanium tetrachloride", "GeCl4", "四氯化锗", "可挥发的锗化合物，只作虚拟认识。", "salt", { kind: "molecule" }],
  ["arsenic trisulfide", "As2S3", "三硫化二砷", "黄色含砷硫化物，有毒，只作虚拟认识。", "salt"],
  ["rubidium sulfate", "Rb2SO4", "硫酸铷", "由铷离子和硫酸根组成的盐。", "salt"],
  ["strontium carbonate", "SrCO3", "碳酸锶", "难溶的锶盐。", "salt"],
  ["yttrium fluoride", "YF3", "氟化钇", "含钇的氟化物配方单元。", "salt"],
  ["zirconium tetrachloride", "ZrCl4", "四氯化锆", "制备锆材料时可用到的卤化物。", "salt"],
  ["niobium pentachloride", "NbCl5", "五氯化铌", "含五价铌的卤化物。", "salt"],
  ["molybdenum disulfide", "MoS2", "二硫化钼", "层状固体，可用作润滑和电子材料。", "salt"],
  ["potassium pertechnetate", "KTcO4", "高锝酸钾", "含放射性锝的盐，只作虚拟认识。", "salt"],
  ["ruthenium(III) chloride", "RuCl3", "三氯化钌", "含钌的卤化物配方单元。", "salt"],
  ["rhodium(III) chloride", "RhCl3", "三氯化铑", "含铑的卤化物配方单元。", "salt"],
  ["palladium(II) oxide", "PdO", "氧化钯", "含二价钯的氧化物，与已有氯化钯形成不同类别。", "oxide"],
  ["cadmium chloride", "CdCl2", "氯化镉", "有毒镉盐，只作虚拟认识。", "salt"],
  ["indium trichloride", "InCl3", "三氯化铟", "含铟的卤化物。", "salt"],
  ["tin(II) chloride", "SnCl2", "氯化亚锡", "含二价锡的常见还原性盐。", "salt"],
  ["antimony trichloride", "SbCl3", "三氯化锑", "含锑的卤化物，有毒，只作虚拟认识。", "salt", { kind: "molecule" }],
  ["tellurium tetrachloride", "TeCl4", "四氯化碲", "含碲的卤化物，只作虚拟认识。", "salt", { kind: "molecule" }],
  ["cesium bromide", "CsBr", "溴化铯", "由铯离子和溴离子组成的晶体。", "salt"],
  ["lanthanum fluoride", "LaF3", "氟化镧", "含镧的稀土氟化物。", "salt"],
  ["cerium(III) chloride", "CeCl3", "三氯化铈", "含三价铈的稀土盐。", "salt"],
  ["praseodymium fluoride", "PrF3", "氟化镨", "含镨的稀土氟化物。", "salt"],
  ["neodymium chloride", "NdCl3", "三氯化钕", "含钕的稀土盐。", "salt"],
  ["promethium(III) oxide", "Pm2O3", "三氧化二钷", "含放射性钷的氧化物，只作虚拟认识。", "oxide"],
  ["samarium fluoride", "SmF3", "氟化钐", "含钐的稀土氟化物。", "salt"],
  ["europium(III) chloride", "EuCl3", "三氯化铕", "含铕的稀土盐。", "salt"],
  ["gadolinium fluoride", "GdF3", "氟化钆", "含钆的稀土氟化物。", "salt"],
  ["terbium(III) chloride", "TbCl3", "三氯化铽", "含铽的稀土盐。", "salt"],
  ["dysprosium fluoride", "DyF3", "氟化镝", "含镝的稀土氟化物。", "salt"],
  ["holmium(III) chloride", "HoCl3", "三氯化钬", "含钬的稀土盐。", "salt"],
  ["erbium fluoride", "ErF3", "氟化铒", "含铒的稀土氟化物。", "salt"],
  ["thulium(III) chloride", "TmCl3", "三氯化铥", "含铥的稀土盐。", "salt"],
  ["ytterbium fluoride", "YbF3", "氟化镱", "含镱的稀土氟化物。", "salt"],
  ["lutetium(III) chloride", "LuCl3", "三氯化镥", "含镥的稀土盐。", "salt"],
  ["hafnium tetrachloride", "HfCl4", "四氯化铪", "含铪的卤化物。", "salt"],
  ["tantalum pentachloride", "TaCl5", "五氯化钽", "含五价钽的卤化物。", "salt"],
  ["tungsten disulfide", "WS2", "二硫化钨", "层状含钨固体，可用作润滑材料。", "salt"],
  ["rhenium pentachloride", "ReCl5", "五氯化铼", "含铼的卤化物，只作虚拟认识。", "salt"],
  ["osmium(III) chloride", "OsCl3", "三氯化锇", "含锇的卤化物，有毒，只作虚拟认识。", "salt"],
  ["iridium(III) chloride", "IrCl3", "三氯化铱", "含铱的卤化物。", "salt"],
  ["platinum(II) chloride", "PtCl2", "二氯化铂", "含二价铂的卤化物。", "salt"],
  ["mercury(II) chloride", "HgCl2", "氯化汞", "剧毒汞盐，只作虚拟认识。", "salt"],
].map((entry) => candidate(...entry.slice(0, 5), {
  ...(entry[5] ?? {}),
  curriculumPriority: 1,
}));

const CANDIDATES = [
  ...REACTION_CANDIDATES,
  ...SUPPLEMENT_CANDIDATES,
  ...LATER_METAL_CANDIDATES,
];

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

function readNumber(source, start) {
  let index = start;
  while (/\d/u.test(source[index] ?? "")) index += 1;
  return index === start
    ? { value: 1, next: start }
    : { value: Number(source.slice(start, index)), next: index };
}

function mergeCounts(target, source, multiplier = 1) {
  for (const [symbol, count] of Object.entries(source)) {
    target[symbol] = (target[symbol] ?? 0) + count * multiplier;
  }
}

function parseGroup(source, start, closing) {
  const counts = {};
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (closing && character === closing) return { counts, next: index + 1 };
    if (character === "(" || character === "[") {
      const nested = parseGroup(source, index + 1, character === "(" ? ")" : "]");
      if (!nested) return null;
      const multiplier = readNumber(source, nested.next);
      mergeCounts(counts, nested.counts, multiplier.value);
      index = multiplier.next;
      continue;
    }
    if (!/[A-Z]/u.test(character)) return null;
    let symbol = character;
    index += 1;
    if (/[a-z]/u.test(source[index] ?? "")) {
      symbol += source[index];
      index += 1;
    }
    const multiplier = readNumber(source, index);
    counts[symbol] = (counts[symbol] ?? 0) + multiplier.value;
    index = multiplier.next;
  }
  return closing ? null : { counts, next: index };
}

function parseFormula(formula) {
  const normalized = formula.replace(/\s+/gu, "").replace(/[+-]\d*$/u, "");
  const total = {};
  for (const rawSegment of normalized.split(/[·.]/u)) {
    if (!rawSegment) return null;
    const coefficient = readNumber(rawSegment, 0);
    const segment = rawSegment.slice(coefficient.next);
    const parsed = parseGroup(segment, 0, null);
    if (!parsed || parsed.next !== segment.length) return null;
    mergeCounts(total, parsed.counts, coefficient.value);
  }
  return Object.keys(total).length > 0 ? total : null;
}

function sameCounts(first, second) {
  const symbols = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...symbols].every((symbol) => first[symbol] === second[symbol]);
}

function expandAtoms(formula) {
  const counts = parseFormula(formula);
  if (!counts) throw new Error(`无法解析配方：${formula}`);
  return Object.entries(counts).flatMap(([symbol, count]) => Array(count).fill(symbol));
}

function compositionLayout(formula) {
  const symbols = expandAtoms(formula);
  if (symbols.length === 1) return [{ symbol: symbols[0], x: 0, y: 0 }];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radiusScale = symbols.length <= 8 ? 1.12 : 2.1;
  return symbols.map((symbol, index) => {
    const ratio = Math.sqrt((index + 0.7) / symbols.length);
    const angle = index * goldenAngle;
    return {
      symbol,
      x: Number((Math.cos(angle) * ratio * radiusScale).toFixed(4)),
      y: Number((Math.sin(angle) * ratio * radiusScale).toFixed(4)),
    };
  });
}

function schematicConnections(atoms) {
  const bonds = [];
  for (let index = 1; index < atoms.length; index += 1) {
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < index; candidateIndex += 1) {
      const distance = Math.hypot(
        atoms[index].x - atoms[candidateIndex].x,
        atoms[index].y - atoms[candidateIndex].y,
      );
      if (distance < nearestDistance) {
        nearest = candidateIndex;
        nearestDistance = distance;
      }
    }
    bonds.push({ from: nearest, to: index, order: 1, style: "dashed" });
  }
  return bonds;
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

async function resolvePubChem(candidateRecord) {
  const nameUrl = new URL(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(candidateRecord.query)}/property/MolecularFormula/JSON`,
  );
  let property;
  try {
    const payload = await fetchJson(nameUrl);
    property = payload.PropertyTable?.Properties?.[0];
  } catch (error) {
    console.warn(`PubChem 名称查询未命中 ${candidateRecord.query}：${String(error).split("\n")[0]}`);
  }
  if (!property) {
    const formulaUrl = new URL(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastformula/${encodeURIComponent(candidateRecord.formula)}/cids/JSON`,
    );
    formulaUrl.searchParams.set("MaxRecords", "1");
    try {
      const payload = await fetchJson(formulaUrl);
      const cid = payload.IdentifierList?.CID?.[0];
      if (cid) property = { CID: cid, MolecularFormula: candidateRecord.formula };
    } catch (error) {
      console.warn(`PubChem 配方查询未命中 ${candidateRecord.formula}：${String(error).split("\n")[0]}`);
    }
  }
  const expected = parseFormula(candidateRecord.formula);
  const actual = property?.MolecularFormula ? parseFormula(property.MolecularFormula) : null;
  if (!expected) {
    throw new Error(`${candidateRecord.formula} 不是可解析的化学式`);
  }
  if (!property?.CID || !actual || !sameCounts(expected, actual)) {
    console.warn(`PubChem 未提供 ${candidateRecord.formula} 的匹配独立记录，改用教材配方单元虚线示意。`);
    return {
      source: {
        name: "人工整理（教材化学式）",
        url: "https://www.pep.com.cn/products/jc/czjks/201510/t20151026_1250781.shtml",
      },
    };
  }
  return {
    cid: property.CID,
    source: {
      name: "PubChem",
      url: `https://pubchem.ncbi.nlm.nih.gov/compound/${property.CID}`,
    },
  };
}

async function fetchPubChemTopology(cid, formula, recordType = "2d") {
  const url = new URL(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/JSON`);
  url.searchParams.set("record_type", recordType);
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
  const coordinateSet = compound.coords?.find((coordinates) => {
    const conformer = coordinates.conformers?.[0];
    return coordinates.aid?.length === aids.length
      && conformer?.x?.length === aids.length
      && conformer?.y?.length === aids.length
      && (recordType !== "3d" || conformer?.z?.length === aids.length);
  });
  if (!coordinateSet) throw new Error(`PubChem CID ${cid} 没有完整${recordType}坐标`);
  const coordinates = coordinateSet.conformers[0];
  const coordinateByAid = new Map(coordinateSet.aid.map((aid, index) => [aid, {
    x: coordinates.x[index],
    y: coordinates.y[index],
    z: coordinates.z?.[index] ?? 0,
  }]));
  const indexByAid = new Map(aids.map((aid, index) => [aid, index]));
  const bondData = compound.bonds ?? { aid1: [], aid2: [], order: [] };
  const bonds = bondData.aid1.map((firstAid, index) => ({
    from: indexByAid.get(firstAid),
    to: indexByAid.get(bondData.aid2[index]),
    order: bondData.order[index],
    style: "solid",
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
    ...coordinateByAid.get(aid),
  }));
  const center = ["x", "y", "z"].reduce((result, axis) => ({
    ...result,
    [axis]: rawAtoms.reduce((total, atom) => total + atom[axis], 0) / rawAtoms.length,
  }), {});
  const bondLengths = bonds
    .map((bond) => {
      const first = rawAtoms[bond.from];
      const second = rawAtoms[bond.to];
      return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
    })
    .sort((first, second) => first - second);
  const medianBondLength = bondLengths[Math.floor(bondLengths.length / 2)];
  if (!medianBondLength) throw new Error(`PubChem CID ${cid} 的键长无效`);
  return {
    atoms: rawAtoms.map((atom) => ({
      symbol: atom.symbol,
      x: Number(((atom.x - center.x) / medianBondLength).toFixed(4)),
      y: Number((-(atom.y - center.y) / medianBondLength).toFixed(4)),
      ...(recordType === "3d"
        ? { z: Number(((atom.z - center.z) / medianBondLength).toFixed(4)) }
        : {}),
    })),
    bonds,
  };
}

function projectPoints(points) {
  const yaw = -0.62;
  const pitch = 0.48;
  return points.map(({ x, y, z }) => {
    const yawX = x * Math.cos(yaw) - z * Math.sin(yaw);
    const yawZ = x * Math.sin(yaw) + z * Math.cos(yaw);
    const pitchY = y * Math.cos(pitch) - yawZ * Math.sin(pitch);
    const pitchZ = y * Math.sin(pitch) + yawZ * Math.cos(pitch);
    return {
      symbol: "C",
      x: Number(yawX.toFixed(4)),
      y: Number(pitchY.toFixed(4)),
      z: Number(pitchZ.toFixed(4)),
    };
  });
}

function diamondTopology() {
  const rawPoints = [
    [0, 0, 0], [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
    [2, 2, 0], [2, 0, 2], [0, 2, 2], [2, -2, 0], [2, 0, -2],
  ].map(([x, y, z]) => ({ x, y, z }));
  return {
    atoms: projectPoints(rawPoints),
    bonds: [
      [0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 6], [1, 7], [2, 8], [2, 9],
    ].map(([from, to]) => ({ from, to, order: 1, style: "solid" })),
  };
}

function grapheneTopology() {
  const atomByKey = new Map();
  const edgeKeys = new Set();
  const atoms = [];
  const bonds = [];
  const radius = 1;
  const indexForPoint = (x, y) => {
    const key = `${x.toFixed(4)},${y.toFixed(4)}`;
    if (!atomByKey.has(key)) {
      atomByKey.set(key, atoms.length);
      atoms.push({ symbol: "C", x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), z: 0 });
    }
    return atomByKey.get(key);
  };
  for (let column = 0; column < 3; column += 1) {
    for (let row = 0; row < 2; row += 1) {
      const centerX = column * 1.5;
      const centerY = Math.sqrt(3) * (row + (column % 2) * 0.5);
      const vertices = Array.from({ length: 6 }, (_, index) => {
        const angle = index * Math.PI / 3;
        return indexForPoint(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
        );
      });
      for (let index = 0; index < 6; index += 1) {
        const from = vertices[index];
        const to = vertices[(index + 1) % 6];
        const key = [from, to].sort((first, second) => first - second).join("-");
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          bonds.push({ from, to, order: 1, style: "solid" });
        }
      }
    }
  }
  const centerX = atoms.reduce((total, atom) => total + atom.x, 0) / atoms.length;
  const centerY = atoms.reduce((total, atom) => total + atom.y, 0) / atoms.length;
  return {
    atoms: atoms.map((atom) => ({ ...atom, x: atom.x - centerX, y: atom.y - centerY })),
    bonds,
  };
}

function nanotubeTopology() {
  const around = 12;
  const rings = 4;
  const atoms = [];
  for (let row = 0; row < rings; row += 1) {
    const offset = row % 2 === 0 ? 0 : Math.PI / around;
    for (let index = 0; index < around; index += 1) {
      const angle = index / around * Math.PI * 2 + offset;
      atoms.push({
        symbol: "C",
        x: Number((Math.cos(angle) * 2.1).toFixed(4)),
        y: Number(((row - (rings - 1) / 2) * 0.92).toFixed(4)),
        z: Number((Math.sin(angle) * 2.1).toFixed(4)),
      });
    }
  }
  const bonds = [];
  for (let row = 0; row < rings; row += 1) {
    for (let index = 0; index < around; index += 1) {
      const current = row * around + index;
      bonds.push({
        from: current,
        to: row * around + (index + 1) % around,
        order: 1,
        style: "solid",
      });
      if (row < rings - 1 && (index + row) % 2 === 0) {
        bonds.push({ from: current, to: (row + 1) * around + index, order: 1, style: "solid" });
      }
    }
  }
  return { atoms, bonds };
}

function truncatedIcosahedronTopology() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices = [];
  for (const first of [-1, 1]) {
    for (const second of [-1, 1]) {
      vertices.push(
        { x: 0, y: first, z: second * phi },
        { x: first, y: second * phi, z: 0 },
        { x: first * phi, y: 0, z: second },
      );
    }
  }
  const edges = [];
  for (let first = 0; first < vertices.length; first += 1) {
    for (let second = first + 1; second < vertices.length; second += 1) {
      const distance = Math.hypot(
        vertices[first].x - vertices[second].x,
        vertices[first].y - vertices[second].y,
        vertices[first].z - vertices[second].z,
      );
      if (Math.abs(distance - 2) < 1e-6) edges.push([first, second]);
    }
  }
  if (edges.length !== 30) throw new Error(`二十面体边数异常：${edges.length}`);

  const directedIndex = new Map();
  const rawPoints = [];
  const indexForDirectedEdge = (from, to) => {
    const key = `${from}-${to}`;
    if (!directedIndex.has(key)) {
      const first = vertices[from];
      const second = vertices[to];
      directedIndex.set(key, rawPoints.length);
      rawPoints.push({
        x: (2 * first.x + second.x) / 3,
        y: (2 * first.y + second.y) / 3,
        z: (2 * first.z + second.z) / 3,
      });
    }
    return directedIndex.get(key);
  };
  const edgePairs = [];
  const neighbors = Array.from({ length: vertices.length }, () => []);
  for (const [first, second] of edges) {
    edgePairs.push([indexForDirectedEdge(first, second), indexForDirectedEdge(second, first)]);
    neighbors[first].push(second);
    neighbors[second].push(first);
  }
  for (let centerIndex = 0; centerIndex < vertices.length; centerIndex += 1) {
    const normal = vertices[centerIndex];
    const normalLength = Math.hypot(normal.x, normal.y, normal.z);
    const unit = { x: normal.x / normalLength, y: normal.y / normalLength, z: normal.z / normalLength };
    const referenceSeed = Math.abs(unit.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    const referenceRaw = {
      x: unit.y * referenceSeed.z - unit.z * referenceSeed.y,
      y: unit.z * referenceSeed.x - unit.x * referenceSeed.z,
      z: unit.x * referenceSeed.y - unit.y * referenceSeed.x,
    };
    const referenceLength = Math.hypot(referenceRaw.x, referenceRaw.y, referenceRaw.z);
    const reference = {
      x: referenceRaw.x / referenceLength,
      y: referenceRaw.y / referenceLength,
      z: referenceRaw.z / referenceLength,
    };
    const tangent = {
      x: unit.y * reference.z - unit.z * reference.y,
      y: unit.z * reference.x - unit.x * reference.z,
      z: unit.x * reference.y - unit.y * reference.x,
    };
    const ordered = [...neighbors[centerIndex]].sort((first, second) => {
      const angleFor = (neighborIndex) => {
        const point = vertices[neighborIndex];
        const dx = point.x - normal.x;
        const dy = point.y - normal.y;
        const dz = point.z - normal.z;
        return Math.atan2(
          dx * tangent.x + dy * tangent.y + dz * tangent.z,
          dx * reference.x + dy * reference.y + dz * reference.z,
        );
      };
      return angleFor(first) - angleFor(second);
    });
    for (let index = 0; index < ordered.length; index += 1) {
      edgePairs.push([
        indexForDirectedEdge(centerIndex, ordered[index]),
        indexForDirectedEdge(centerIndex, ordered[(index + 1) % ordered.length]),
      ]);
    }
  }
  if (rawPoints.length !== 60 || edgePairs.length !== 90) {
    throw new Error(`C60 拓扑异常：${rawPoints.length} 个顶点、${edgePairs.length} 条边`);
  }

  const adjacency = Array.from({ length: rawPoints.length }, () => []);
  edgePairs.forEach(([from, to], edgeIndex) => {
    adjacency[from].push({ to, edgeIndex });
    adjacency[to].push({ to: from, edgeIndex });
  });
  const matchedEdges = new Set();
  const matchedVertices = new Set();
  const findMatching = () => {
    if (matchedVertices.size === rawPoints.length) return true;
    const unmatched = Array.from({ length: rawPoints.length }, (_, index) => index)
      .filter((index) => !matchedVertices.has(index))
      .sort((first, second) => (
        adjacency[first].filter(({ to }) => !matchedVertices.has(to)).length
        - adjacency[second].filter(({ to }) => !matchedVertices.has(to)).length
      ));
    const current = unmatched[0];
    for (const { to, edgeIndex } of adjacency[current]) {
      if (matchedVertices.has(to)) continue;
      matchedVertices.add(current);
      matchedVertices.add(to);
      matchedEdges.add(edgeIndex);
      if (findMatching()) return true;
      matchedVertices.delete(current);
      matchedVertices.delete(to);
      matchedEdges.delete(edgeIndex);
    }
    return false;
  };
  if (!findMatching() || matchedEdges.size !== 30) {
    throw new Error("未能为 C60 求出代表性单双键匹配");
  }

  return {
    atoms: projectPoints(rawPoints),
    bonds: edgePairs.map(([from, to], edgeIndex) => ({
      from,
      to,
      order: matchedEdges.has(edgeIndex) ? 2 : 1,
      style: "solid",
    })),
  };
}

function allotropeRecord(id, formula, name, feature, topology, source) {
  return {
    id,
    formula,
    name,
    nameEnglish: id.replace(/^curriculum-/, "").replaceAll("-", " "),
    feature,
    family: "inorganic",
    kind: "allotrope",
    category: "allotrope",
    curriculumPriority: 2,
    representation: "representative-lattice",
    atoms: topology.atoms,
    bonds: topology.bonds,
    source,
  };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

async function main() {
  const records = [];
  for (const [index, candidateRecord] of CANDIDATES.entries()) {
    const resolved = await resolvePubChem(candidateRecord);
    const topology = candidateRecord.kind === "molecule" && resolved.cid
      ? await fetchPubChemTopology(resolved.cid, candidateRecord.formula)
      : undefined;
    const atoms = topology?.atoms ?? compositionLayout(candidateRecord.formula);
    records.push({
      id: `curriculum-${slugify(candidateRecord.query)}`,
      cid: resolved.cid,
      formula: candidateRecord.formula,
      name: candidateRecord.name,
      nameEnglish: candidateRecord.query,
      feature: candidateRecord.feature,
      family: candidateRecord.family,
      kind: candidateRecord.kind,
      category: candidateRecord.category,
      curriculumPriority: candidateRecord.curriculumPriority,
      representation: topology ? "authoritative-topology" : "composition-schematic",
      atoms,
      bonds: topology?.bonds ?? schematicConnections(atoms),
      source: resolved.source,
    });
    if ((index + 1) % 10 === 0 || index + 1 === CANDIDATES.length) {
      console.log(`教材常见物质核验 ${index + 1}/${CANDIDATES.length}`);
    }
  }

  const fullereneTopology = truncatedIcosahedronTopology();
  records.push(
    allotropeRecord(
      "curriculum-diamond",
      "C",
      "金刚石",
      "每个碳原子以四面体方式连接；这里展示 10 个碳原子的典型晶格片段。",
      diamondTopology(),
      { name: "Crystallography Open Database", url: "https://www.crystallography.net/cod/9012293.html" },
    ),
    {
      ...allotropeRecord(
        "curriculum-buckminsterfullerene",
        "C60",
        "碳六十（C₆₀）",
        "60 个碳原子围成由五边形和六边形组成的球形笼。",
        fullereneTopology,
        { name: "Nature", url: "https://doi.org/10.1038/318162a0" },
      ),
      cid: 123591,
      representation: "authoritative-topology",
    },
    allotropeRecord(
      "curriculum-carbon-nanotube",
      "C",
      "碳纳米管",
      "石墨烯式六角碳网卷成的中空管；这里展示 48 个碳原子的代表性片段。",
      nanotubeTopology(),
      { name: "Nature", url: "https://doi.org/10.1038/354056a0" },
    ),
    allotropeRecord(
      "curriculum-graphene",
      "C",
      "石墨烯",
      "单原子层蜂窝状碳网；这里展示由多个六边形拼成的代表性片段。",
      grapheneTopology(),
      { name: "Nobel Prize", url: "https://www.nobelprize.org/prizes/physics/2010/popular-information/" },
    ),
  );

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    count: records.length,
    scope: {
      conservationReactionCount: 165,
      dashedLineRule: "虚线只表示配方单元中各原子的组成关系，不表示共价键或离子间存在双键。",
      carbonModelRule: "无限晶体与纳米材料展示注明原子数的代表性有限片段。",
    },
    sources: [
      {
        name: "人民教育出版社《化学 九年级下册》",
        url: "https://www.pep.com.cn/products/jc/czjks/201510/t20151026_1250781.shtml",
        role: "确定酸、碱、盐和金属材料的教材范围",
      },
      {
        name: "PubChem PUG REST",
        url: "https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest",
        role: "逐条核验 CID、分子式与可用分子拓扑",
      },
      {
        name: "Crystallography Open Database",
        url: "https://www.crystallography.net/cod/9012293.html",
        role: "金刚石晶格来源",
      },
      {
        name: "Nature",
        url: "https://doi.org/10.1038/318162a0",
        role: "C₆₀ 截角二十面体结构来源",
      },
      {
        name: "Nature",
        url: "https://doi.org/10.1038/354056a0",
        role: "碳纳米管结构来源",
      },
      {
        name: "Nobel Prize",
        url: "https://www.nobelprize.org/prizes/physics/2010/popular-information/",
        role: "石墨烯单层蜂窝晶格来源",
      },
    ],
    records,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`已生成 ${records.length} 种教材常见物质与碳结构。`);
}

await main();
