export type FunctionKind =
  | "linear"
  | "quadratic"
  | "cubic"
  | "sine"
  | "cosine"
  | "absolute"
  | "square-root"
  | "reciprocal"
  | "exponential";

export type FunctionParameter = {
  key: string;
  symbol: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  meaning: string;
};

export type FunctionDefinition = {
  id: FunctionKind;
  name: string;
  family: string;
  baseFormula: string;
  shape: string;
  parameters: readonly FunctionParameter[];
  evaluate: (x: number, parameters: Readonly<Record<string, number>>) => number | null;
  equation: (parameters: Readonly<Record<string, number>>) => string;
};

export type FunctionCurve = {
  id: string;
  definitionId: FunctionKind;
  parameters: Record<string, number>;
  colorIndex: number;
  visible: boolean;
};

export type FunctionPoint = {
  x: number;
  y: number;
};

const EPSILON = 1e-8;

function finite(value: number) {
  return Number.isFinite(value) && Math.abs(value) < 1_000_000 ? value : null;
}

export function formatNumber(value: number) {
  const normalized = Math.abs(value) < EPSILON ? 0 : value;
  if (Number.isInteger(normalized)) return String(normalized);
  return normalized.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function signed(value: number, suffix = "") {
  const absolute = formatNumber(Math.abs(value));
  return `${value < 0 ? " − " : " + "}${absolute}${suffix}`;
}

function firstTerm(value: number, suffix = "") {
  return `${value < 0 ? "−" : ""}${formatNumber(Math.abs(value))}${suffix}`;
}

export const FUNCTION_DEFINITIONS: readonly FunctionDefinition[] = [
  {
    id: "linear",
    name: "一次函数",
    family: "直线家族",
    baseFormula: "y = ax + b",
    shape: "像一束笔直的光，a 决定方向，b 推着它上下移动。",
    parameters: [
      { key: "a", symbol: "a", label: "斜率", min: -4, max: 4, step: 0.25, initial: 1, meaning: "控制直线向上还是向下" },
      { key: "b", symbol: "b", label: "高度", min: -6, max: 6, step: 0.5, initial: 1, meaning: "推动整条直线上下移动" },
    ],
    evaluate: (x, p) => finite(p.a * x + p.b),
    equation: (p) => `y = ${firstTerm(p.a, "x")}${signed(p.b)}`,
  },
  {
    id: "quadratic",
    name: "二次函数",
    family: "抛物线家族",
    baseFormula: "y = ax² + bx + c",
    shape: "像一只碗或一座小山，a 的正负会让开口翻转。",
    parameters: [
      { key: "a", symbol: "a", label: "开口", min: -2, max: 2, step: 0.25, initial: 0.5, meaning: "控制开口方向和宽窄" },
      { key: "b", symbol: "b", label: "偏移", min: -4, max: 4, step: 0.5, initial: 0, meaning: "改变弯曲中心的位置" },
      { key: "c", symbol: "c", label: "高度", min: -6, max: 6, step: 0.5, initial: -1, meaning: "推动图像上下移动" },
    ],
    evaluate: (x, p) => finite(p.a * x * x + p.b * x + p.c),
    equation: (p) => `y = ${firstTerm(p.a, "x²")}${signed(p.b, "x")}${signed(p.c)}`,
  },
  {
    id: "cubic",
    name: "三次函数",
    family: "弯弯曲曲家族",
    baseFormula: "y = ax³ + bx² + cx + d",
    shape: "常常像一条穿过星空的 S 形航线，会有更多转弯。",
    parameters: [
      { key: "a", symbol: "a", label: "主弯曲", min: -1, max: 1, step: 0.1, initial: 0.15, meaning: "控制远处向上还是向下" },
      { key: "b", symbol: "b", label: "第二弯", min: -2, max: 2, step: 0.25, initial: 0, meaning: "改变中间的弯曲形状" },
      { key: "c", symbol: "c", label: "斜方向", min: -4, max: 4, step: 0.25, initial: -1, meaning: "拉动图像中间的方向" },
      { key: "d", symbol: "d", label: "高度", min: -5, max: 5, step: 0.5, initial: 0, meaning: "推动整条曲线上下移动" },
    ],
    evaluate: (x, p) => finite(p.a * x ** 3 + p.b * x ** 2 + p.c * x + p.d),
    equation: (p) => `y = ${firstTerm(p.a, "x³")}${signed(p.b, "x²")}${signed(p.c, "x")}${signed(p.d)}`,
  },
  {
    id: "sine",
    name: "正弦函数",
    family: "波浪家族",
    baseFormula: "y = A·sin(Bx + C) + D",
    shape: "像有节奏的海浪，一直重复着升起和落下。",
    parameters: [
      { key: "A", symbol: "A", label: "浪高", min: -5, max: 5, step: 0.25, initial: 2, meaning: "控制波浪有多高" },
      { key: "B", symbol: "B", label: "密度", min: 0.25, max: 3, step: 0.25, initial: 1, meaning: "控制波浪挤得多紧" },
      { key: "C", symbol: "C", label: "左右移动", min: -3, max: 3, step: 0.25, initial: 0, meaning: "推动波浪左右移动" },
      { key: "D", symbol: "D", label: "上下移动", min: -5, max: 5, step: 0.5, initial: 0, meaning: "推动波浪整体上下移动" },
    ],
    evaluate: (x, p) => finite(p.A * Math.sin(p.B * x + p.C) + p.D),
    equation: (p) => `y = ${firstTerm(p.A)}·sin(${firstTerm(p.B, "x")}${signed(p.C)})${signed(p.D)}`,
  },
  {
    id: "cosine",
    name: "余弦函数",
    family: "波浪家族",
    baseFormula: "y = A·cos(Bx + C) + D",
    shape: "也是波浪，但它从波峰附近出发，和正弦像一对伙伴。",
    parameters: [
      { key: "A", symbol: "A", label: "浪高", min: -5, max: 5, step: 0.25, initial: 2, meaning: "控制波浪有多高" },
      { key: "B", symbol: "B", label: "密度", min: 0.25, max: 3, step: 0.25, initial: 1, meaning: "控制波浪挤得多紧" },
      { key: "C", symbol: "C", label: "左右移动", min: -3, max: 3, step: 0.25, initial: 0, meaning: "推动波浪左右移动" },
      { key: "D", symbol: "D", label: "上下移动", min: -5, max: 5, step: 0.5, initial: 0, meaning: "推动波浪整体上下移动" },
    ],
    evaluate: (x, p) => finite(p.A * Math.cos(p.B * x + p.C) + p.D),
    equation: (p) => `y = ${firstTerm(p.A)}·cos(${firstTerm(p.B, "x")}${signed(p.C)})${signed(p.D)}`,
  },
  {
    id: "absolute",
    name: "绝对值函数",
    family: "折线家族",
    baseFormula: "y = A|x − H| + K",
    shape: "像一个会移动、会翻转的 V 字形山谷。",
    parameters: [
      { key: "A", symbol: "A", label: "开口", min: -4, max: 4, step: 0.25, initial: 1, meaning: "控制 V 字的方向和宽窄" },
      { key: "H", symbol: "H", label: "左右移动", min: -5, max: 5, step: 0.5, initial: 0, meaning: "推动尖角左右移动" },
      { key: "K", symbol: "K", label: "上下移动", min: -5, max: 5, step: 0.5, initial: 0, meaning: "推动尖角上下移动" },
    ],
    evaluate: (x, p) => finite(p.A * Math.abs(x - p.H) + p.K),
    equation: (p) => `y = ${firstTerm(p.A)}|x${signed(-p.H)}|${signed(p.K)}`,
  },
  {
    id: "square-root",
    name: "平方根函数",
    family: "起跑线家族",
    baseFormula: "y = A√(x − H) + K",
    shape: "从一个起点出发，只向右边慢慢延伸。",
    parameters: [
      { key: "A", symbol: "A", label: "方向", min: -4, max: 4, step: 0.25, initial: 1.5, meaning: "控制曲线向上或向下伸展" },
      { key: "H", symbol: "H", label: "起点左右", min: -5, max: 5, step: 0.5, initial: 0, meaning: "决定曲线从哪个 x 开始" },
      { key: "K", symbol: "K", label: "起点高度", min: -5, max: 5, step: 0.5, initial: 0, meaning: "决定曲线从哪个高度开始" },
    ],
    evaluate: (x, p) => x < p.H ? null : finite(p.A * Math.sqrt(x - p.H) + p.K),
    equation: (p) => `y = ${firstTerm(p.A)}√(x${signed(-p.H)})${signed(p.K)}`,
  },
  {
    id: "reciprocal",
    name: "反比例函数",
    family: "双曲线家族",
    baseFormula: "y = A/(x − H) + K",
    shape: "像两艘互相靠近却不碰到坐标线的飞船。",
    parameters: [
      { key: "A", symbol: "A", label: "方向", min: -8, max: 8, step: 0.5, initial: 4, meaning: "控制两支曲线所在的方向" },
      { key: "H", symbol: "H", label: "分界线", min: -4, max: 4, step: 0.5, initial: 0, meaning: "移动曲线碰不到的竖线" },
      { key: "K", symbol: "K", label: "中心高度", min: -4, max: 4, step: 0.5, initial: 0, meaning: "移动曲线碰不到的横线" },
    ],
    evaluate: (x, p) => Math.abs(x - p.H) < EPSILON ? null : finite(p.A / (x - p.H) + p.K),
    equation: (p) => `y = ${firstTerm(p.A)}/(x${signed(-p.H)})${signed(p.K)}`,
  },
  {
    id: "exponential",
    name: "指数函数",
    family: "快速成长家族",
    baseFormula: "y = A·Bˣ + K",
    shape: "有时慢慢出发、突然长高，像知识越积越多。",
    parameters: [
      { key: "A", symbol: "A", label: "方向", min: -4, max: 4, step: 0.25, initial: 1, meaning: "控制曲线在上方还是下方" },
      { key: "B", symbol: "B", label: "成长速度", min: 0.25, max: 3, step: 0.25, initial: 1.5, meaning: "大于 1 会越长越快" },
      { key: "K", symbol: "K", label: "高度", min: -5, max: 5, step: 0.5, initial: 0, meaning: "推动整条曲线上下移动" },
    ],
    evaluate: (x, p) => finite(p.A * p.B ** x + p.K),
    equation: (p) => `y = ${firstTerm(p.A)}·${formatNumber(p.B)}ˣ${signed(p.K)}`,
  },
] as const;

const DEFINITIONS_BY_ID = new Map(FUNCTION_DEFINITIONS.map((definition) => [definition.id, definition]));

export function getDefinition(id: FunctionKind) {
  const definition = DEFINITIONS_BY_ID.get(id);
  if (!definition) throw new Error(`Unknown function definition: ${id}`);
  return definition;
}

export function createFunctionCurve(
  definitionId: FunctionKind,
  id: string,
  colorIndex: number,
): FunctionCurve {
  const definition = getDefinition(definitionId);
  return {
    id,
    definitionId,
    colorIndex,
    visible: true,
    parameters: Object.fromEntries(
      definition.parameters.map((parameter) => [parameter.key, parameter.initial]),
    ),
  };
}

export function setCurveParameter(
  curve: FunctionCurve,
  parameterKey: string,
  requestedValue: number,
): FunctionCurve {
  const definition = getDefinition(curve.definitionId);
  const parameter = definition.parameters.find((candidate) => candidate.key === parameterKey);
  if (!parameter) return curve;
  const clamped = Math.min(parameter.max, Math.max(parameter.min, requestedValue));
  const steps = Math.round((clamped - parameter.min) / parameter.step);
  const snapped = parameter.min + steps * parameter.step;
  const precision = Math.max(0, (String(parameter.step).split(".")[1] ?? "").length);
  return {
    ...curve,
    parameters: {
      ...curve.parameters,
      [parameterKey]: Number(snapped.toFixed(precision)),
    },
  };
}

export function evaluateCurve(curve: FunctionCurve, x: number) {
  return getDefinition(curve.definitionId).evaluate(x, curve.parameters);
}

export function curveEquation(curve: FunctionCurve) {
  return getDefinition(curve.definitionId).equation(curve.parameters);
}

export function canAddCurve(curves: readonly FunctionCurve[]) {
  return curves.length < 4;
}

export function sampleCurve(
  curve: FunctionCurve,
  xMin: number,
  xMax: number,
  sampleCount = 400,
  visibleY = 10,
) {
  const segments: FunctionPoint[][] = [];
  let segment: FunctionPoint[] = [];
  let previous: FunctionPoint | null = null;

  for (let index = 0; index <= sampleCount; index += 1) {
    const x = xMin + (index / sampleCount) * (xMax - xMin);
    const y = evaluateCurve(curve, x);
    const point = y === null || Math.abs(y) > visibleY * 5 ? null : { x, y };
    const crossedJump = point && previous && Math.abs(point.y - previous.y) > visibleY * 1.7;

    if (!point || crossedJump) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
      previous = null;
      if (!point) continue;
    }

    segment.push(point);
    previous = point;
  }

  if (segment.length > 1) segments.push(segment);
  return segments;
}

export function describeCurve(curve: FunctionCurve) {
  const p = curve.parameters;
  switch (curve.definitionId) {
    case "linear":
      if (Math.abs(p.a) < EPSILON) return `a 是 0，所以它变成了高度为 ${formatNumber(p.b)} 的水平线。`;
      return p.a > 0
        ? `a 是正数，直线从左下方向右上方升起。`
        : `a 是负数，直线从左上方向右下方落下。`;
    case "quadratic":
      if (Math.abs(p.a) < EPSILON) return "a 变成 0 后，抛物线暂时变成了一条直线。";
      return p.a > 0 ? "a 是正数，抛物线像一只向上的碗。" : "a 是负数，抛物线像一座向下的小山。";
    case "cubic":
      if (Math.abs(p.a) < EPSILON) return "a 变成 0 后，最高的三次弯曲暂时消失了。";
      return p.a > 0 ? "看远处：曲线总体从左下走向右上。" : "看远处：曲线总体从左上走向右下。";
    case "sine":
    case "cosine":
      return `浪高大约是 ${formatNumber(Math.abs(p.A))}，B 越大，同样宽度里会出现更多波浪。`;
    case "absolute":
      return p.A >= 0 ? `V 字尖角在 (${formatNumber(p.H)}, ${formatNumber(p.K)})。` : `倒过来的 V 字尖角在 (${formatNumber(p.H)}, ${formatNumber(p.K)})。`;
    case "square-root":
      return `这条曲线从 (${formatNumber(p.H)}, ${formatNumber(p.K)}) 出发，左边暂时没有图像。`;
    case "reciprocal":
      return `曲线会靠近 x = ${formatNumber(p.H)} 和 y = ${formatNumber(p.K)}，但不会碰到它们。`;
    case "exponential":
      if (Math.abs(p.B - 1) < EPSILON) return "B 是 1，快速成长暂时变成了一条水平线。";
      return p.B > 1 ? "B 大于 1，曲线向右会越来越快地长高。" : "B 小于 1，曲线向右会慢慢靠近一条水平线。";
  }
}
