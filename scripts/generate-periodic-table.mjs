import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const OUTPUT_PATH = resolve(
  import.meta.dirname,
  "../apps/web/src/features/periodic-table/elements.generated.ts",
);

const CHINESE_NAMES = [
  "氢", "氦", "锂", "铍", "硼", "碳", "氮", "氧", "氟", "氖",
  "钠", "镁", "铝", "硅", "磷", "硫", "氯", "氩", "钾", "钙",
  "钪", "钛", "钒", "铬", "锰", "铁", "钴", "镍", "铜", "锌",
  "镓", "锗", "砷", "硒", "溴", "氪", "铷", "锶", "钇", "锆",
  "铌", "钼", "锝", "钌", "铑", "钯", "银", "镉", "铟", "锡",
  "锑", "碲", "碘", "氙", "铯", "钡", "镧", "铈", "镨", "钕",
  "钷", "钐", "铕", "钆", "铽", "镝", "钬", "铒", "铥", "镱",
  "镥", "铪", "钽", "钨", "铼", "锇", "铱", "铂", "金", "汞",
  "铊", "铅", "铋", "钋", "砹", "氡", "钫", "镭", "锕", "钍",
  "镤", "铀", "镎", "钚", "镅", "锔", "锫", "锎", "锿", "镄",
  "钔", "锘", "铹", "𬬻", "𬭊", "𬭳", "𬭛", "𬭶", "鿏", "𫟼",
  "𬬭", "鿔", "鿭", "𫓧", "镆", "𫟷", "鿬", "鿫",
];

const PINYIN = [
  "qīng", "hài", "lǐ", "pí", "péng", "tàn", "dàn", "yǎng", "fú", "nǎi",
  "nà", "měi", "lǚ", "guī", "lín", "liú", "lǜ", "yà", "jiǎ", "gài",
  "kàng", "tài", "fán", "gè", "měng", "tiě", "gǔ", "niè", "tóng", "xīn",
  "jiā", "zhě", "shēn", "xī", "xiù", "kè", "rú", "sī", "yǐ", "gào",
  "ní", "mù", "dé", "liǎo", "lǎo", "bǎ", "yín", "gé", "yīn", "xī",
  "tī", "dì", "diǎn", "xiān", "sè", "bèi", "lán", "shì", "pǔ", "nǚ",
  "pǒ", "shān", "yǒu", "gá", "tè", "dī", "huǒ", "ěr", "diū", "yì",
  "lǔ", "hā", "tǎn", "wū", "lái", "é", "yī", "bó", "jīn", "gǒng",
  "tā", "qiān", "bì", "pō", "ài", "dōng", "fāng", "léi", "ā", "tǔ",
  "pú", "yóu", "ná", "bù", "méi", "jú", "péi", "kāi", "āi", "fèi",
  "mén", "nuò", "láo", "lú", "dù", "xǐ", "bō", "hēi", "mài", "dá",
  "lún", "gē", "nǐ", "fū", "mò", "lì", "tián", "ào",
];

const NOBLE_GAS_SHELLS = {
  He: [2],
  Ne: [2, 8],
  Ar: [2, 8, 8],
  Kr: [2, 8, 18, 8],
  Xe: [2, 8, 18, 18, 8],
  Rn: [2, 8, 18, 32, 18, 8],
};

const CATEGORY_MAP = {
  "Alkali metal": ["alkali-metal", "碱金属"],
  "Alkaline earth metal": ["alkaline-earth", "碱土金属"],
  "Transition metal": ["transition-metal", "过渡金属"],
  "Post-transition metal": ["post-transition-metal", "其他金属"],
  Metalloid: ["metalloid", "类金属"],
  Nonmetal: ["nonmetal", "非金属"],
  Halogen: ["halogen", "卤素"],
  "Noble gas": ["noble-gas", "稀有气体"],
  Lanthanide: ["lanthanide", "镧系元素"],
  Actinide: ["actinide", "锕系元素"],
};

function positionFor(atomicNumber) {
  if (atomicNumber === 1) return { period: 1, group: 1, displayRow: 1, displayColumn: 1 };
  if (atomicNumber === 2) return { period: 1, group: 18, displayRow: 1, displayColumn: 18 };
  if (atomicNumber >= 3 && atomicNumber <= 10) {
    const groups = [1, 2, 13, 14, 15, 16, 17, 18];
    const group = groups[atomicNumber - 3];
    return { period: 2, group, displayRow: 2, displayColumn: group };
  }
  if (atomicNumber >= 11 && atomicNumber <= 18) {
    const groups = [1, 2, 13, 14, 15, 16, 17, 18];
    const group = groups[atomicNumber - 11];
    return { period: 3, group, displayRow: 3, displayColumn: group };
  }
  if (atomicNumber >= 19 && atomicNumber <= 36) {
    const group = atomicNumber - 18;
    return { period: 4, group, displayRow: 4, displayColumn: group };
  }
  if (atomicNumber >= 37 && atomicNumber <= 54) {
    const group = atomicNumber - 36;
    return { period: 5, group, displayRow: 5, displayColumn: group };
  }
  if (atomicNumber === 55 || atomicNumber === 56) {
    const group = atomicNumber - 54;
    return { period: 6, group, displayRow: 6, displayColumn: group };
  }
  if (atomicNumber >= 57 && atomicNumber <= 71) {
    return {
      period: 6,
      group: null,
      displayRow: 8,
      displayColumn: atomicNumber - 54,
    };
  }
  if (atomicNumber >= 72 && atomicNumber <= 86) {
    const group = atomicNumber - 68;
    return { period: 6, group, displayRow: 6, displayColumn: group };
  }
  if (atomicNumber === 87 || atomicNumber === 88) {
    const group = atomicNumber - 86;
    return { period: 7, group, displayRow: 7, displayColumn: group };
  }
  if (atomicNumber >= 89 && atomicNumber <= 103) {
    return {
      period: 7,
      group: null,
      displayRow: 9,
      displayColumn: atomicNumber - 86,
    };
  }
  const group = atomicNumber - 100;
  return { period: 7, group, displayRow: 7, displayColumn: group };
}

function shellDistribution(configuration, atomicNumber) {
  const shells = Array(7).fill(0);
  const nobleGas = configuration.match(/\[([A-Za-z]+)\]/)?.[1];
  if (nobleGas && NOBLE_GAS_SHELLS[nobleGas]) {
    NOBLE_GAS_SHELLS[nobleGas].forEach((count, index) => {
      shells[index] = count;
    });
  }
  for (const match of configuration.matchAll(/(\d)(?:s|p|d|f|g)(\d+)/g)) {
    shells[Number(match[1]) - 1] += Number(match[2]);
  }
  while (shells.at(-1) === 0) shells.pop();
  const total = shells.reduce((sum, count) => sum + count, 0);
  if (total !== atomicNumber) {
    throw new Error(
      `Electron shell total mismatch for ${atomicNumber}: ${configuration} -> ${shells.join(",")}`,
    );
  }
  return shells;
}

function stringOrNull(value) {
  return value === "" ? null : value;
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input);
const columns = payload.Table.Columns.Column;
const rows = payload.Table.Row;

if (rows.length !== 118 || CHINESE_NAMES.length !== 118 || PINYIN.length !== 118) {
  throw new Error("Periodic table source or Chinese metadata does not contain exactly 118 elements.");
}

const elements = rows.map(({ Cell }) => {
  const source = Object.fromEntries(columns.map((column, index) => [column, Cell[index] ?? ""]));
  const atomicNumber = Number(source.AtomicNumber);
  const [category, categoryLabel] = CATEGORY_MAP[source.GroupBlock] ?? [
    "unknown",
    source.GroupBlock || "未知分类",
  ];
  return {
    atomicNumber,
    symbol: source.Symbol,
    englishName: source.Name,
    chineseName: CHINESE_NAMES[atomicNumber - 1],
    pinyin: PINYIN[atomicNumber - 1],
    atomicMass: source.AtomicMass,
    electronConfiguration: source.ElectronConfiguration.replace(/\s+/g, " ").trim(),
    shells: shellDistribution(source.ElectronConfiguration, atomicNumber),
    electronegativity: stringOrNull(source.Electronegativity),
    atomicRadius: stringOrNull(source.AtomicRadius),
    ionizationEnergy: stringOrNull(source.IonizationEnergy),
    electronAffinity: stringOrNull(source.ElectronAffinity),
    oxidationStates: stringOrNull(source.OxidationStates),
    standardState: stringOrNull(source.StandardState),
    meltingPoint: stringOrNull(source.MeltingPoint),
    boilingPoint: stringOrNull(source.BoilingPoint),
    density: stringOrNull(source.Density),
    category,
    categoryLabel,
    yearDiscovered: stringOrNull(source.YearDiscovered),
    ...positionFor(atomicNumber),
  };
});

const output = `// Generated from PubChem PUG REST Periodic Table data.
// Source: https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON
// Chinese names follow the Chinese Chemical Society / IUPAC Chinese periodic table.
// Run: curl -fsSL https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON | node scripts/generate-periodic-table.mjs

export type ElementCategory =
  | "alkali-metal"
  | "alkaline-earth"
  | "transition-metal"
  | "post-transition-metal"
  | "metalloid"
  | "nonmetal"
  | "halogen"
  | "noble-gas"
  | "lanthanide"
  | "actinide";

export interface PeriodicElementRecord {
  atomicNumber: number;
  symbol: string;
  englishName: string;
  chineseName: string;
  pinyin: string;
  atomicMass: string;
  electronConfiguration: string;
  shells: readonly number[];
  electronegativity: string | null;
  atomicRadius: string | null;
  ionizationEnergy: string | null;
  electronAffinity: string | null;
  oxidationStates: string | null;
  standardState: string | null;
  meltingPoint: string | null;
  boilingPoint: string | null;
  density: string | null;
  category: ElementCategory;
  categoryLabel: string;
  yearDiscovered: string | null;
  period: number;
  group: number | null;
  displayRow: number;
  displayColumn: number;
}

export const ELEMENTS: readonly PeriodicElementRecord[] = ${JSON.stringify(elements, null, 2)};
`;

await writeFile(OUTPUT_PATH, output, "utf8");
console.log(`Generated ${elements.length} elements at ${OUTPUT_PATH}`);
