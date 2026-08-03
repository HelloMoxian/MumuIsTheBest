import type {
  LearningMission,
  MissionChoice,
  MissionGameDefinition,
  MissionGameId,
  MissionVisual,
} from "./logic";

type ChoiceInput = {
  id: string;
  prompt: string;
  hint: string;
  conclusion: string;
  explanation: string;
  choices: readonly (readonly [id: string, label: string, detail?: string, aliases?: readonly string[]])[];
  answer: string;
  visual: MissionVisual;
};

function toChoices(
  choices: ChoiceInput["choices"],
): MissionChoice[] {
  return choices.map(([id, label, detail, voiceAliases]) => ({
    id,
    label,
    detail,
    voiceAliases,
  }));
}

function choice(input: ChoiceInput): LearningMission {
  return { ...input, kind: "choice", choices: toChoices(input.choices) };
}

function sequence(
  input: Omit<ChoiceInput, "answer"> & { answer: readonly string[] },
): LearningMission {
  return { ...input, kind: "sequence", choices: toChoices(input.choices) };
}

const visual = (
  mode: MissionVisual["mode"],
  eyebrow: string,
  title: string,
  ...tokens: string[]
): MissionVisual => ({ mode, eyebrow, title, tokens });

const experimentMaster: MissionGameDefinition = {
  id: "experiment-master",
  route: "/chemistry/experiment-master",
  subject: "化学",
  title: "实验大师",
  mark: "⌁",
  subtitle: "先做预测，再揭开现象背后的原因",
  introduction: "这里是安全的虚拟观察舱。木木不用接触真实材料，也能像科学家一样先猜想、再观察、最后解释。",
  accent: "orange",
  speechLanguage: "zh-CN",
  goals: ["观察物质变化", "学习比较与预测", "把现象说出原因"],
  missions: [
    choice({
      id: "salt-dissolves",
      prompt: "盐进入水中并充分搅拌后，最可能看到什么？",
      hint: "想想盐粒会不会一直保持原来的大颗粒。",
      conclusion: "盐粒看不见了，但盐还在水里",
      explanation: "盐分成很小的离子，均匀分散在水中，形成透明盐水；它不是消失了。",
      choices: [["clear", "水仍然透明", "盐均匀分散"], ["bottom", "盐全在杯底"], ["gas", "变成气泡飞走"]],
      answer: "clear",
      visual: visual("particles", "溶解观察", "盐 + 水", "Na⁺", "Cl⁻", "H₂O"),
    }),
    choice({
      id: "sand-filter",
      prompt: "沙子和水混在一起，哪种办法更适合把沙子分开？",
      hint: "沙粒比过滤材料的小孔更大。",
      conclusion: "过滤能把不溶于水的沙粒拦住",
      explanation: "水能穿过过滤层，较大的沙粒被留下。过滤不能把已经溶解的盐从水中直接滤掉。",
      choices: [["filter", "过滤", "让水穿过小孔"], ["magnet", "用磁铁"], ["stir", "继续搅拌"]],
      answer: "filter",
      visual: visual("particles", "分离观察", "沙子 + 水", "沙", "水", "滤层"),
    }),
    choice({
      id: "oil-layer",
      prompt: "同样体积的食用油比水轻，静置后油通常在哪里？",
      hint: "密度较小的液体通常浮在密度较大的液体上。",
      conclusion: "油会形成上层，水在下层",
      explanation: "油和水不容易互相溶解，油的密度通常比水小，所以会浮在水面形成一层。",
      choices: [["top", "水面上方"], ["bottom", "杯子最底部"], ["gone", "完全消失"]],
      answer: "top",
      visual: visual("scale", "密度观察", "油水分层", "油", "水"),
    }),
    choice({
      id: "warm-dissolve",
      prompt: "同样多的糖放进同样多的冷水和温水，哪杯通常溶解得更快？",
      hint: "温水中的水分子运动更快。",
      conclusion: "在其他条件相同时，糖通常在温水中溶解更快",
      explanation: "升高温度会让水分子运动加快，与糖接触更频繁；搅拌也会影响溶解速度。",
      choices: [["warm", "温水", "分子运动更快"], ["cold", "冷水"], ["same", "一定完全一样"]],
      answer: "warm",
      visual: visual("particles", "速度比较", "冷水 / 温水", "慢", "快"),
    }),
    choice({
      id: "evaporate-salt",
      prompt: "盐水中的水慢慢蒸发后，杯中更可能留下什么？",
      hint: "水能变成水蒸气，盐在这个温度下不会一起蒸发。",
      conclusion: "水离开后，盐可以重新结晶留下",
      explanation: "蒸发时主要是水分子进入空气；盐仍在容器中，水越来越少时会形成盐晶体。",
      choices: [["crystal", "盐晶体"], ["nothing", "什么都没有"], ["oil", "一层油"]],
      answer: "crystal",
      visual: visual("particles", "蒸发观察", "盐水 → ?", "H₂O↑", "盐晶体"),
    }),
    choice({
      id: "cold-cup",
      prompt: "冰凉杯子外面出现小水滴，这些水主要来自哪里？",
      hint: "杯外的空气里本来就有看不见的水蒸气。",
      conclusion: "空气中的水蒸气在冷杯外壁凝结",
      explanation: "潮湿空气碰到冷表面，水蒸气冷却成液态小水滴；通常不是杯里的水穿过杯壁。",
      choices: [["air", "周围空气", "水蒸气凝结"], ["inside", "从杯壁里面漏出"], ["glass", "玻璃自己变成水"]],
      answer: "air",
      visual: visual("particles", "凝结观察", "冷杯外的小水滴", "水蒸气", "冷表面", "水滴"),
    }),
    choice({
      id: "indicator",
      prompt: "在虚拟指示剂里，颜色变化主要帮助科学家观察什么？",
      hint: "它不是用来称重量，也不是测长度。",
      conclusion: "指示剂能帮助判断溶液的酸碱性",
      explanation: "一些指示剂在不同酸碱环境中呈现不同颜色，它们提供判断线索，但不是所有物质都能靠肉眼区分。",
      choices: [["ph", "酸碱性"], ["mass", "质量"], ["length", "长度"]],
      answer: "ph",
      visual: visual("beam", "颜色线索", "虚拟酸碱指示", "酸性", "中性", "碱性"),
    }),
    choice({
      id: "gas-space",
      prompt: "给气球充气后气球变大，说明空气具有什么特点？",
      hint: "气球里面新增了许多空气粒子。",
      conclusion: "空气会占据空间",
      explanation: "空气虽然看不见，却是物质，有质量也占据空间；进入更多空气后，气球体积增大。",
      choices: [["space", "会占据空间"], ["none", "什么都不占"], ["solid", "一定是固体"]],
      answer: "space",
      visual: visual("particles", "气体观察", "空气进入气球", "空气", "空间"),
    }),
    choice({
      id: "magnetic-separate",
      prompt: "铁屑和沙子混在一起，哪种工具能优先吸走铁屑？",
      hint: "铁是能被常见磁铁吸引的材料。",
      conclusion: "磁铁可以从沙子中分离铁屑",
      explanation: "磁铁会吸引铁屑，而普通沙粒不会被明显吸引，这利用了两种材料不同的磁性。",
      choices: [["magnet", "磁铁"], ["filter", "滤纸"], ["lamp", "手电筒"]],
      answer: "magnet",
      visual: visual("beam", "性质分离", "铁屑 + 沙子", "N", "S", "铁"),
    }),
    sequence({
      id: "water-treatment-order",
      prompt: "把虚拟浑水处理过程按合理顺序点亮。",
      hint: "先让较大的杂质安静下来，再拦住小颗粒，最后才处理微生物。",
      conclusion: "沉降、过滤、消毒是常见净水流程中的连续环节",
      explanation: "真实自来水处理还有更多严格步骤和检测；这个顺序只是帮助理解各环节作用，不能代替饮用水标准。",
      choices: [["filter", "过滤"], ["disinfect", "消毒"], ["settle", "沉降"]],
      answer: ["settle", "filter", "disinfect"],
      visual: visual("sequence", "流程排序", "虚拟净水站", "沉降", "过滤", "消毒"),
    }),
  ],
};

export const MISSION_GAME_DEFINITIONS: readonly MissionGameDefinition[] = [
  experimentMaster,
];

export const MISSION_GAME_BY_ID = new Map<MissionGameId, MissionGameDefinition>(
  MISSION_GAME_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export const MISSION_GAME_BY_ROUTE = new Map<string, MissionGameDefinition>(
  MISSION_GAME_DEFINITIONS.map((definition) => [definition.route, definition]),
);
