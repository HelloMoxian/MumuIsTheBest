import {
  elementCompounds,
  type CompoundRecord,
} from "../periodic-table/element-knowledge";
import { ELEMENTS } from "../periodic-table/elements.generated";
import {
  atomCountTotal,
  normalizeFormula,
  parseFormula,
  type CompoundKind,
  type ReactionCompound,
} from "./logic";

type SourceCompound = CompoundRecord & { kind?: CompoundKind };

const SUPPLEMENTAL_COMPOUNDS: readonly SourceCompound[] = [
  { formula: "H₂", name: "氢气", note: "最轻的气体，可作为燃料和化工原料", kind: "molecule" },
  { formula: "N₂", name: "氮气", note: "空气的主要成分，分子中有很强的三键", kind: "molecule" },
  { formula: "O₂", name: "氧气", note: "支持呼吸和燃烧的双原子分子", kind: "molecule" },
  { formula: "F₂", name: "氟气", note: "反应性极强的双原子分子，仅作虚拟观察", kind: "molecule" },
  { formula: "Cl₂", name: "氯气", note: "黄绿色且有毒的双原子气体，仅作虚拟观察", kind: "molecule" },
  { formula: "Br₂", name: "溴", note: "常温下呈红棕色液体的双原子物质", kind: "molecule" },
  { formula: "I₂", name: "碘", note: "受热可形成紫色蒸气的双原子物质", kind: "molecule" },
  { formula: "P₄", name: "白磷结构单元", note: "四个磷原子组成四面体结构，仅作虚拟观察", kind: "allotrope" },
  { formula: "S₈", name: "环八硫", note: "常见硫单质由八个硫原子组成环形结构", kind: "allotrope" },
  { formula: "C₆₀", name: "富勒烯 C60", note: "六十个碳原子组成近似足球形的碳笼", kind: "allotrope" },
  { formula: "C₇₀", name: "富勒烯 C70", note: "七十个碳原子组成拉长的封闭碳笼", kind: "allotrope" },
  { formula: "C₂H₂", name: "乙炔", note: "含碳碳三键，可燃且反应活泼", kind: "molecule" },
  { formula: "C₂H₄", name: "乙烯", note: "植物成熟信号分子，也是重要化工原料", kind: "molecule" },
  { formula: "C₂H₆", name: "乙烷", note: "天然气中的小分子烃", kind: "molecule" },
  { formula: "C₂H₆O", name: "乙醇", note: "含羟基的有机分子，具有挥发性和可燃性", kind: "molecule" },
  { formula: "C₃H₈", name: "丙烷", note: "液化石油气中的常见燃料分子", kind: "molecule" },
  { formula: "C₃H₈O", name: "异丙醇", note: "常见溶剂和清洁剂成分", kind: "molecule" },
  { formula: "C₄H₁₀", name: "丁烷", note: "可液化储存的燃料分子", kind: "molecule" },
  { formula: "C₅H₁₂", name: "戊烷", note: "易挥发的烷烃液体", kind: "molecule" },
  { formula: "C₆H₁₄", name: "己烷", note: "非极性有机溶剂，具有可燃性", kind: "molecule" },
  { formula: "C₇H₁₆", name: "庚烷", note: "用于燃料性质研究的直链烷烃", kind: "molecule" },
  { formula: "C₈H₁₈", name: "异辛烷", note: "辛烷值标度的重要参照物", kind: "molecule" },
  { formula: "C₆H₆", name: "苯", note: "具有稳定芳香环的有机分子，有毒且易燃", kind: "molecule" },
  { formula: "C₇H₈", name: "甲苯", note: "带甲基的芳香分子，是常见工业溶剂", kind: "molecule" },
  { formula: "C₈H₁₀", name: "二甲苯", note: "芳香族溶剂的一类代表分子", kind: "molecule" },
  { formula: "CH₂O", name: "甲醛", note: "最简单的醛，气味刺激，仅作虚拟观察", kind: "molecule" },
  { formula: "CH₄O", name: "甲醇", note: "最简单的醇，有毒且可燃", kind: "molecule" },
  { formula: "C₂H₄O₂", name: "乙酸", note: "食醋酸味的主要来源", kind: "molecule" },
  { formula: "C₃H₆O", name: "丙酮", note: "挥发较快的极性有机溶剂", kind: "molecule" },
  { formula: "C₃H₆O₃", name: "乳酸", note: "含羟基和羧基的有机酸", kind: "molecule" },
  { formula: "C₃H₄O₃", name: "丙酮酸", note: "细胞能量代谢中的重要中间分子", kind: "molecule" },
  { formula: "C₂H₂O₄", name: "草酸", note: "含两个羧基的简单有机酸", kind: "molecule" },
  { formula: "C₄H₆O₆", name: "酒石酸", note: "葡萄等植物中可见的有机酸", kind: "molecule" },
  { formula: "C₆H₈O₇", name: "柠檬酸", note: "柑橘类水果酸味的重要来源", kind: "molecule" },
  { formula: "C₇H₆O₂", name: "苯甲酸", note: "常见芳香族羧酸，可用于食品防腐", kind: "molecule" },
  { formula: "C₆H₁₂O₆", name: "葡萄糖", note: "细胞常用的能量分子", kind: "molecule" },
  { formula: "C₁₂H₂₂O₁₁", name: "蔗糖", note: "由葡萄糖和果糖单元组成的食糖", kind: "molecule" },
  { formula: "C₅H₁₀O₅", name: "核糖", note: "RNA 结构中的五碳糖", kind: "molecule" },
  { formula: "C₅H₁₀O₄", name: "脱氧核糖", note: "DNA 骨架中的五碳糖", kind: "molecule" },
  { formula: "C₈H₁₀N₄O₂", name: "咖啡因", note: "茶和咖啡中的含氮有机分子", kind: "molecule" },
  { formula: "C₉H₈O₄", name: "阿司匹林", note: "常见药物分子乙酰水杨酸", kind: "molecule" },
  { formula: "C₈H₉NO₂", name: "对乙酰氨基酚", note: "常见解热镇痛药物分子", kind: "molecule" },
  { formula: "C₉H₁₃NO₃", name: "肾上腺素", note: "参与应激反应的生物信号分子", kind: "molecule" },
  { formula: "C₈H₁₁NO₂", name: "多巴胺", note: "参与运动、学习和奖励的神经递质", kind: "molecule" },
  { formula: "C₁₀H₁₄N₂", name: "尼古丁", note: "烟草中的有毒生物碱，仅作虚拟观察", kind: "molecule" },
  { formula: "Na₂O", name: "氧化钠", note: "由钠离子和氧离子形成的离子固体", kind: "formula-unit" },
  { formula: "K₂O", name: "氧化钾", note: "由钾和氧组成的碱性氧化物", kind: "formula-unit" },
  { formula: "NH₄Cl", name: "氯化铵", note: "由铵根离子和氯离子构成的白色晶体", kind: "formula-unit" },
  { formula: "(NH₄)₂SO₄", name: "硫酸铵", note: "常见含氮肥料的配方单元", kind: "formula-unit" },
  { formula: "(NH₄)₂CO₃", name: "碳酸铵", note: "受热容易分解的铵盐", kind: "formula-unit" },
  { formula: "Na₂SO₄", name: "硫酸钠", note: "由钠离子和硫酸根离子组成", kind: "formula-unit" },
  { formula: "Na₂SO₃", name: "亚硫酸钠", note: "具有还原性的无机盐", kind: "formula-unit" },
  { formula: "Na₂S₂O₃", name: "硫代硫酸钠", note: "摄影定影和水处理中使用的盐", kind: "formula-unit" },
  { formula: "K₂SO₄", name: "硫酸钾", note: "含钾肥料中的常见盐", kind: "formula-unit" },
  { formula: "K₂CO₃", name: "碳酸钾", note: "用于玻璃和肥皂制造的碱性盐", kind: "formula-unit" },
  { formula: "CaCl₂", name: "氯化钙", note: "容易吸水，可用于干燥和融雪", kind: "formula-unit" },
  { formula: "CaC₂", name: "碳化钙", note: "与水接触会产生乙炔，仅作虚拟观察", kind: "formula-unit" },
  { formula: "Al₂(SO₄)₃", name: "硫酸铝", note: "水处理和造纸中使用的铝盐", kind: "formula-unit" },
  { formula: "FeCl₂", name: "氯化亚铁", note: "含二价铁的浅绿色盐", kind: "formula-unit" },
  { formula: "FeCl₃", name: "氯化铁", note: "含三价铁的盐，可用于水处理", kind: "formula-unit" },
  { formula: "CuCl₂", name: "氯化铜", note: "常呈蓝绿色的铜盐", kind: "formula-unit" },
  { formula: "Cu(NO₃)₂", name: "硝酸铜", note: "含铜离子和硝酸根的蓝色晶体", kind: "formula-unit" },
  { formula: "ZnCl₂", name: "氯化锌", note: "易吸水的锌盐", kind: "formula-unit" },
  { formula: "Pb(NO₃)₂", name: "硝酸铅", note: "有毒的铅盐，仅作虚拟观察", kind: "formula-unit" },
  { formula: "H₂CO₃", name: "碳酸", note: "二氧化碳溶于水形成的弱酸", kind: "molecule" },
  { formula: "HClO", name: "次氯酸", note: "具有氧化和消毒能力的弱酸", kind: "molecule" },
  { formula: "HClO₄", name: "高氯酸", note: "强酸和强氧化剂，仅作虚拟观察", kind: "molecule" },
  { formula: "NaClO₃", name: "氯酸钠", note: "强氧化性无机盐，仅作虚拟观察", kind: "formula-unit" },
  { formula: "KClO₃", name: "氯酸钾", note: "强氧化性无机盐，仅作虚拟观察", kind: "formula-unit" },
  { formula: "Na₂O₂", name: "过氧化钠", note: "含过氧根的淡黄色固体", kind: "formula-unit" },
  { formula: "KO₂", name: "超氧化钾", note: "可释放氧气的超氧化物", kind: "formula-unit" },
  { formula: "B₄C", name: "碳化硼", note: "轻而坚硬的陶瓷材料", kind: "formula-unit" },
  { formula: "Si₃N₄", name: "氮化硅", note: "耐磨耐高温的工程陶瓷", kind: "formula-unit" },
  { formula: "AlN", name: "氮化铝", note: "导热良好的电绝缘陶瓷", kind: "formula-unit" },
  { formula: "Fe₃C", name: "渗碳体", note: "钢铁中重要的碳化铁结构", kind: "intermetallic" },
  { formula: "Li₄Ti₅O₁₂", name: "钛酸锂", note: "锂离子电池负极材料", kind: "formula-unit" },
  { formula: "LiNiMnCoO₂", name: "镍锰钴酸锂", note: "常见三元锂电池正极材料", kind: "formula-unit" },
  { formula: "Na₃AlF₆", name: "冰晶石", note: "铝电解生产中的重要助熔剂", kind: "formula-unit" },
  { formula: "K₄[Fe(CN)₆]", name: "亚铁氰化钾", note: "含稳定配合离子的黄色晶体", kind: "formula-unit" },
  { formula: "K₃[Fe(CN)₆]", name: "铁氰化钾", note: "含三价铁氰配离子的红色晶体", kind: "formula-unit" },
  { formula: "(NH₄)₂Fe(SO₄)₂·6H₂O", name: "莫尔盐", note: "稳定的二价铁复盐水合物", kind: "hydrate" },
] as const;

const MOLECULAR_FORMULAS = new Set([
  "H2O", "H2O2", "NH3", "CH4", "HCl", "HeH", "CO2", "CO", "HNO3",
  "NO", "NO2", "O3", "HF", "H3BO3", "SiH4", "H3PO4", "P4O10", "H2SO4",
  "SO2", "H2S", "ClO2", "TiCl4", "Ni(CO)4", "GeH4", "AsH3", "SeO2",
  "HBr", "KrF2", "RuO4", "SnCl4", "TeO2", "XeF2", "XeF4", "XeF6",
  "XeO3", "OsO4", "HAt", "AtCl", "Sg(CO)6", "BhO3Cl", "HsO4",
]);

function inferKind(source: SourceCompound, counts: Readonly<Record<string, number>>): CompoundKind {
  if (source.kind) return source.kind;
  if (source.formula.includes("·")) return "hydrate";
  if (source.name.includes("合金")) return "intermetallic";
  if (Object.keys(counts).length === 1) return "allotrope";
  return MOLECULAR_FORMULAS.has(normalizeFormula(source.formula))
    ? "molecule"
    : "formula-unit";
}

const ELEMENT_SYMBOLS = new Set(ELEMENTS.map((element) => element.symbol));
const sourceByFormula = new Map<string, SourceCompound>();

for (const source of ELEMENTS.flatMap((element) => elementCompounds(element))) {
  if (source.formula !== "—") sourceByFormula.set(normalizeFormula(source.formula), source);
}
for (const source of SUPPLEMENTAL_COMPOUNDS) {
  sourceByFormula.set(normalizeFormula(source.formula), source);
}

export const REACTION_COMPOUNDS: readonly ReactionCompound[] = [...sourceByFormula.values()]
  .flatMap((source) => {
    const atomCounts = parseFormula(source.formula);
    if (
      !atomCounts
      || Object.keys(atomCounts).some((symbol) => !ELEMENT_SYMBOLS.has(symbol))
      || atomCountTotal(atomCounts) > 120
    ) {
      return [];
    }
    const id = `compound-${normalizeFormula(source.formula)
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`;
    return [{
      id,
      formula: source.formula,
      name: source.name,
      feature: source.note,
      kind: inferKind(source, atomCounts),
      atomCounts,
      totalAtoms: atomCountTotal(atomCounts),
    }];
  })
  .sort((a, b) => a.totalAtoms - b.totalAtoms || a.formula.localeCompare(b.formula));

export const COMPOUND_KIND_LABELS: Readonly<Record<CompoundKind, string>> = {
  molecule: "分子",
  "formula-unit": "配方单元",
  allotrope: "单质结构",
  hydrate: "水合物",
  intermetallic: "材料结构",
};
