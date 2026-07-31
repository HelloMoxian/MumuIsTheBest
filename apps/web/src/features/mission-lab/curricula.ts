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

const matterWorld: MissionGameDefinition = {
  id: "matter-world",
  route: "/chemistry/matter-world",
  subject: "化学",
  title: "物质虚拟世界",
  mark: "∴",
  subtitle: "钻进粒子之间，看见固液气的秘密",
  introduction: "同一种物质可以有不同状态。观察粒子靠得多近、动得多快，就能找到物态变化的线索。",
  accent: "cyan",
  speechLanguage: "zh-CN",
  goals: ["辨认固液气粒子", "理解物态变化", "发现扩散和压缩"],
  missions: [
    choice({ id: "solid", prompt: "粒子排列紧密、位置比较固定，只在附近振动。这更像哪种状态？", hint: "想想积木整齐靠在一起的样子。", conclusion: "紧密而位置固定的排列是固体模型", explanation: "固体粒子之间作用较强，通常只能在平衡位置附近振动，所以固体能保持自己的形状。", choices: [["solid", "固体"], ["liquid", "液体"], ["gas", "气体"]], answer: "solid", visual: visual("particles", "粒子观察", "紧密 · 微微振动", "●", "●", "●", "●") }),
    choice({ id: "liquid", prompt: "粒子仍然靠得较近，但能互相滑动。这更像哪种状态？", hint: "它能流动，也会改变外形。", conclusion: "靠近但能滑动的排列是液体模型", explanation: "液体粒子距离较近却能彼此移动，所以液体有一定体积，却会随容器改变形状。", choices: [["gas", "气体"], ["liquid", "液体"], ["solid", "固体"]], answer: "liquid", visual: visual("particles", "粒子观察", "靠近 · 可以滑动", "●", "●", "●") }),
    choice({ id: "gas", prompt: "粒子相距很远，在整个容器里快速运动。这更像哪种状态？", hint: "这种状态会尽量充满整个容器。", conclusion: "分散且快速运动的是气体模型", explanation: "气体粒子间距大、运动自由，因此气体没有固定形状和体积，会充满可用空间。", choices: [["liquid", "液体"], ["solid", "固体"], ["gas", "气体"]], answer: "gas", visual: visual("particles", "粒子观察", "分散 · 快速运动", "●", "●", "●") }),
    choice({ id: "melting", prompt: "冰吸收热量变成水，这个变化叫什么？", hint: "它从固态来到了液态。", conclusion: "固态变成液态叫熔化", explanation: "冰吸热后粒子运动增强，原本较固定的结构被打破，形成能流动的液态水。", choices: [["melt", "熔化"], ["freeze", "凝固"], ["condense", "凝结"]], answer: "melt", visual: visual("particles", "状态变化", "冰 → 水", "固态", "液态") }),
    choice({ id: "freezing", prompt: "水放出热量变成冰，这个变化叫什么？", hint: "它从液态回到了固态。", conclusion: "液态变成固态叫凝固", explanation: "水冷却到凝固点附近并继续放热，粒子形成更有序的固态结构。", choices: [["boil", "沸腾"], ["freeze", "凝固"], ["sublime", "升华"]], answer: "freeze", visual: visual("particles", "状态变化", "水 → 冰", "液态", "固态") }),
    choice({ id: "evaporation", prompt: "晾着的湿衣服慢慢变干，水主要发生了什么变化？", hint: "水分子离开衣服进入空气。", conclusion: "液态水蒸发成水蒸气进入空气", explanation: "蒸发能在液体表面和多种温度下发生；空气流动、温度和湿度都会影响快慢。", choices: [["evaporate", "蒸发"], ["freeze", "凝固"], ["melt", "熔化"]], answer: "evaporate", visual: visual("particles", "生活观察", "湿衣服 → 干衣服", "液态水", "水蒸气") }),
    choice({ id: "condensation", prompt: "水蒸气遇冷变成小水滴，这个变化叫什么？", hint: "气态回到了液态。", conclusion: "气态变成液态叫凝结", explanation: "水蒸气放出热量后形成液态小水滴，云和冷表面上的水滴都与凝结有关。", choices: [["condense", "凝结"], ["melt", "熔化"], ["sublime", "升华"]], answer: "condense", visual: visual("particles", "状态变化", "水蒸气 → 水滴", "气态", "液态") }),
    choice({ id: "sublimation", prompt: "固态二氧化碳直接变成气体，没有先成为液体，这叫做什么？", hint: "它跳过了液态。", conclusion: "固态直接变成气态叫升华", explanation: "干冰在常压下会升华成二氧化碳气体；演示周围的白雾主要是空气中水蒸气凝结的小水滴。", choices: [["sublime", "升华"], ["freeze", "凝固"], ["boil", "沸腾"]], answer: "sublime", visual: visual("particles", "跨级变化", "固态 CO₂ → 气态 CO₂", "固态", "气态") }),
    choice({ id: "diffusion", prompt: "房间一边的气味慢慢传到另一边，最能说明什么？", hint: "空气和气味粒子一直在运动。", conclusion: "粒子的无规则运动会带来扩散", explanation: "粒子不断运动并互相碰撞，使物质从浓度高的区域逐渐分散到浓度低的区域。", choices: [["diffuse", "会发生扩散"], ["still", "粒子完全不动"], ["vanish", "物质消失了"]], answer: "diffuse", visual: visual("particles", "扩散观察", "从浓到淡", "多", "中", "少") }),
    choice({ id: "compress", prompt: "固体、液体、气体中，通常哪一种更容易被压缩？", hint: "看看哪种状态的粒子间空隙最大。", conclusion: "气体通常最容易被压缩", explanation: "气体粒子间有较大空隙，受压时距离能明显减小；固体和液体的粒子已经靠得很近。", choices: [["gas", "气体"], ["liquid", "液体"], ["solid", "固体"]], answer: "gas", visual: visual("particles", "空间观察", "向内压缩", "←", "气体", "→") }),
  ],
};

const wordOrbit: MissionGameDefinition = {
  id: "word-orbit",
  route: "/english/word-orbit",
  subject: "英语",
  title: "单词轨道",
  mark: "Aa",
  subtitle: "看见单词，听见声音，找到它的意思",
  introduction: "从身边最常见的英文词开始。木木可以点“朗读题目”听发音，再用大按钮找到对应的意思。",
  accent: "violet",
  speechLanguage: "en-US",
  goals: ["认识高频单词", "连接声音和拼写", "敢于开口跟读"],
  missions: [
    choice({ id: "cat", prompt: "Which one means “猫”?  哪个词表示“猫”？", hint: "听听开头是 /k/ 的短声音。", conclusion: "cat 的意思是猫", explanation: "cat 读作 /kæt/，是一个常见动物名词。复数通常写作 cats。", choices: [["cat", "cat"], ["dog", "dog"], ["bird", "bird"]], answer: "cat", visual: visual("word", "ANIMAL WORD", "cat", "c", "a", "t") }),
    choice({ id: "dog", prompt: "Which one means “狗”?  哪个词表示“狗”？", hint: "这个词由 d、o、g 三个字母组成。", conclusion: "dog 的意思是狗", explanation: "dog 是常见动物名词。句子 This is a dog. 表示“这是一只狗”。", choices: [["fish", "fish"], ["dog", "dog"], ["cat", "cat"]], answer: "dog", visual: visual("word", "ANIMAL WORD", "dog", "d", "o", "g") }),
    choice({ id: "red", prompt: "Which word means “红色”?  哪个词表示“红色”？", hint: "它以字母 r 开头。", conclusion: "red 的意思是红色", explanation: "red 可以描述颜色，例如 a red apple 表示“一个红苹果”。", choices: [["blue", "blue"], ["green", "green"], ["red", "red"]], answer: "red", visual: visual("word", "COLOR WORD", "red", "R", "红色") }),
    choice({ id: "blue", prompt: "Which word means “蓝色”?  哪个词表示“蓝色”？", hint: "天空常常看起来是这种颜色。", conclusion: "blue 的意思是蓝色", explanation: "blue 可以作颜色词，例如 blue sky 表示“蓝天”。", choices: [["blue", "blue"], ["yellow", "yellow"], ["red", "red"]], answer: "blue", visual: visual("word", "COLOR WORD", "blue", "B", "蓝色") }),
    choice({ id: "one", prompt: "Which word means the number 1?  哪个词表示数字 1？", hint: "它由 o、n、e 三个字母组成。", conclusion: "one 表示数字一", explanation: "one 读作 /wʌn/。虽然开头写 o，声音却以 /w/ 开始，需要把拼写和读音一起记。", choices: [["two", "two"], ["one", "one"], ["three", "three"]], answer: "one", visual: visual("number", "NUMBER WORD", "one", "1", "one") }),
    choice({ id: "three", prompt: "Which word means the number 3?  哪个词表示数字 3？", hint: "这个词以 th 开头。", conclusion: "three 表示数字三", explanation: "three 的 th 发音时舌尖轻轻靠近上下牙之间，先慢慢听清，不用着急读得很快。", choices: [["four", "four"], ["two", "two"], ["three", "three"]], answer: "three", visual: visual("number", "NUMBER WORD", "three", "3", "three") }),
    choice({ id: "hand", prompt: "Which word means “手”?  哪个词表示“手”？", hint: "它以 h 开头，以 d 结尾。", conclusion: "hand 的意思是手", explanation: "hand 是身体部位词。Raise your hand. 表示“举起你的手”。", choices: [["head", "head"], ["hand", "hand"], ["foot", "foot"]], answer: "hand", visual: visual("body", "BODY WORD", "hand", "h", "and") }),
    choice({ id: "eye", prompt: "Which word means “眼睛”?  哪个词表示“眼睛”？", hint: "它只有三个字母，读音和字母 I 相同。", conclusion: "eye 的意思是眼睛", explanation: "eye 读作 /aɪ/，复数 eyes 表示两只或多只眼睛。", choices: [["ear", "ear"], ["eye", "eye"], ["nose", "nose"]], answer: "eye", visual: visual("body", "BODY WORD", "eye", "看", "eye") }),
    choice({ id: "jump", prompt: "Which word means “跳”?  哪个词表示“跳”？", hint: "它是一个动作词，以 j 开头。", conclusion: "jump 的意思是跳", explanation: "jump 是动作词。I can jump. 表示“我会跳”。", choices: [["run", "run"], ["sit", "sit"], ["jump", "jump"]], answer: "jump", visual: visual("word", "ACTION WORD", "jump", "J", "向上") }),
    choice({ id: "mother", prompt: "Which word means “妈妈”?  哪个词表示“妈妈”？", hint: "它以 m 开头，中间有 th。", conclusion: "mother 的意思是母亲、妈妈", explanation: "mother 是家庭成员词，日常也常说 mom 或 mum；不同地区常用词略有不同。", choices: [["father", "father"], ["sister", "sister"], ["mother", "mother"]], answer: "mother", visual: visual("word", "FAMILY WORD", "mother", "m", "other") }),
  ],
};

const unitMagic: MissionGameDefinition = {
  id: "unit-magic",
  route: "/physics/unit-magic",
  subject: "物理",
  title: "单位魔法",
  mark: "cm",
  subtitle: "先认清在量什么，再给数字穿上单位",
  introduction: "同一个数字配上不同单位，会变成完全不同的大小。用生活参照判断长度、质量、时间、温度和容量。",
  accent: "green",
  speechLanguage: "zh-CN",
  goals: ["认识常见单位", "建立生活量级", "选择合适测量工具"],
  missions: [
    choice({ id: "pencil-cm", prompt: "一支铅笔的长度大约 15 什么？", hint: "它比一米短很多。", conclusion: "铅笔长度适合用厘米表示", explanation: "厘米适合测量较小物体。常见新铅笔大约十几到二十厘米，具体长度会不同。", choices: [["cm", "厘米 cm"], ["m", "米 m"], ["km", "千米 km"]], answer: "cm", visual: visual("scale", "长度参照", "铅笔约 15 ?", "0", "15", "cm") }),
    choice({ id: "door-m", prompt: "一扇房门的高度大约 2 什么？", hint: "它和成年人的身高是相近量级。", conclusion: "房门高度适合用米表示", explanation: "米适合测量房间和人的高度。常见房门大约两米高，但不同门会有差别。", choices: [["mm", "毫米 mm"], ["m", "米 m"], ["km", "千米 km"]], answer: "m", visual: visual("scale", "长度参照", "房门约 2 ?", "1 m", "2 m") }),
    choice({ id: "city-km", prompt: "两个城市之间的距离更适合用什么单位？", hint: "这是很长的路程。", conclusion: "城市间距离通常用千米表示", explanation: "1 千米等于 1000 米。道路里程、城市间距离常使用千米。", choices: [["cm", "厘米"], ["m", "米"], ["km", "千米"]], answer: "km", visual: visual("scale", "远距离", "城市 A —— 城市 B", "A", "千米", "B") }),
    choice({ id: "apple-g", prompt: "一个苹果的质量大约 200 什么？", hint: "它远不到 200 千克。", conclusion: "苹果质量适合用克表示", explanation: "克适合表示较轻物体的质量。不同苹果大小不同，常见苹果可能在一两百克左右。", choices: [["g", "克 g"], ["kg", "千克 kg"], ["t", "吨 t"]], answer: "g", visual: visual("scale", "质量参照", "苹果约 200 ?", "苹果", "200", "g") }),
    choice({ id: "child-kg", prompt: "一个孩子的体重更适合用什么单位表示？", hint: "体重秤常显示这个单位。", conclusion: "人的体重通常用千克表示", explanation: "千克适合表示人的体重和较重物品的质量；1 千克等于 1000 克。", choices: [["g", "克"], ["kg", "千克"], ["mg", "毫克"]], answer: "kg", visual: visual("scale", "质量参照", "体重秤", "kg") }),
    choice({ id: "blink-second", prompt: "眨一次眼睛的时间更适合用什么单位？", hint: "这是非常短的时间。", conclusion: "眨眼时间适合用秒来描述", explanation: "秒是常用的短时间单位；60 秒等于 1 分钟。", choices: [["second", "秒"], ["minute", "分钟"], ["hour", "小时"]], answer: "second", visual: visual("sequence", "时间参照", "眨眼", "开始", "不到 1 秒", "结束") }),
    choice({ id: "class-minute", prompt: "一节课的时间更适合用什么单位？", hint: "它比几秒长，又远不到几天。", conclusion: "一节课通常用分钟表示", explanation: "分钟适合描述一节课、一次活动或一段短行程；不同学校的课时长度会不同。", choices: [["second", "秒"], ["minute", "分钟"], ["year", "年"]], answer: "minute", visual: visual("sequence", "时间参照", "一节课", "开始", "几十分钟", "下课") }),
    choice({ id: "milk-ml", prompt: "一小盒牛奶的容量更适合用什么单位？", hint: "包装上常见 200 或 250 后面跟着这个单位。", conclusion: "小盒饮料容量常用毫升表示", explanation: "毫升适合表示较少的液体体积；1000 毫升等于 1 升。", choices: [["ml", "毫升 mL"], ["l", "升 L"], ["km", "千米 km"]], answer: "ml", visual: visual("scale", "容量参照", "小盒牛奶", "250", "mL") }),
    choice({ id: "bucket-l", prompt: "一个水桶能装多少水，更适合用什么单位？", hint: "它比一小盒牛奶能装得多。", conclusion: "水桶容量通常用升表示", explanation: "升适合表示水桶、饮水壶等容器的容量；实际容量取决于容器大小。", choices: [["ml", "毫升"], ["l", "升"], ["g", "克"]], answer: "l", visual: visual("scale", "容量参照", "水桶", "L") }),
    choice({ id: "temperature-c", prompt: "描述今天有多热或多冷，常用哪个单位？", hint: "天气预报里常看到 °C。", conclusion: "日常气温常用摄氏度表示", explanation: "摄氏度写作 °C，用来描述温度。温度和热量不是同一个概念。", choices: [["celsius", "摄氏度 °C"], ["meter", "米 m"], ["liter", "升 L"]], answer: "celsius", visual: visual("scale", "温度参照", "天气温度", "低", "°C", "高") }),
  ],
};

const forceLab: MissionGameDefinition = {
  id: "force-lab",
  route: "/physics/force-lab",
  subject: "物理",
  title: "力的实验舱",
  mark: "→",
  subtitle: "推一推、拉一拉，观察运动怎样改变",
  introduction: "力看不见，但能从物体速度、方向和形状的变化中找到它。这里用安全的虚拟场景来观察。",
  accent: "cyan",
  speechLanguage: "zh-CN",
  goals: ["分辨推力和拉力", "观察速度与方向", "认识重力摩擦和磁力"],
  missions: [
    choice({ id: "gravity", prompt: "松开手中的小球后，它通常会向哪里运动？", hint: "地球会吸引附近的物体。", conclusion: "重力让小球向地面加速", explanation: "地球引力把小球拉向地面。空气阻力也存在，但在这个简单场景里重力作用更明显。", choices: [["down", "向地面"], ["up", "一直向上"], ["still", "永远停在空中"]], answer: "down", visual: visual("beam", "重力观察", "松开小球", "球", "↓", "地面") }),
    choice({ id: "friction", prompt: "玩具车在粗糙地面上滑行，为什么会慢下来？", hint: "接触面会阻碍相对运动。", conclusion: "摩擦力会让玩具车逐渐减速", explanation: "轮子和地面、车轴等位置的摩擦，加上空气阻力，会把一部分运动能转化为内能和声音。", choices: [["friction", "摩擦和阻力"], ["magic", "数字变小"], ["gravity-up", "向上的重力"]], answer: "friction", visual: visual("beam", "运动观察", "快 → 慢", "车", "粗糙地面") }),
    choice({ id: "push", prompt: "从后面向前推静止的小车，小车最可能怎样变化？", hint: "推力方向指向前方。", conclusion: "向前的推力能让小车开始向前运动", explanation: "力可以改变物体的运动状态。实际运动还受到摩擦、质量和推力大小影响。", choices: [["forward", "向前运动"], ["back", "向后运动"], ["vanish", "消失"]], answer: "forward", visual: visual("beam", "推力观察", "手 → 小车", "推", "→", "车") }),
    choice({ id: "pull", prompt: "用绳子拉小车时，拉力沿什么方向作用？", hint: "绳子绷紧后会把小车拉向手。", conclusion: "绳子的拉力指向拉绳的一侧", explanation: "绳子只能在绷紧时传递拉力，不能像硬杆一样直接推着物体走。", choices: [["hand", "朝向手"], ["away", "远离手"], ["down", "只向下"]], answer: "hand", visual: visual("beam", "拉力观察", "手 ← 绳子 ← 车", "手", "绳", "车") }),
    choice({ id: "magnet", prompt: "磁铁靠近铁回形针时，回形针通常会怎样？", hint: "铁是常见的磁性材料。", conclusion: "磁力可以隔着一小段距离吸引铁制回形针", explanation: "磁场能在不直接接触时产生作用；木头、塑料等材料通常不会像铁那样被明显吸引。", choices: [["attract", "靠近磁铁"], ["repel", "一定远离"], ["melt", "立刻熔化"]], answer: "attract", visual: visual("beam", "磁力观察", "磁铁 · 回形针", "N", "S", "铁") }),
    choice({ id: "elastic", prompt: "轻轻压缩弹簧再松手，弹簧为什么会恢复？", hint: "它发生形变后会产生恢复方向的力。", conclusion: "弹性力帮助弹簧恢复原来的形状", explanation: "在不过度拉伸或压缩的范围内，弹簧形变会产生弹性恢复力；超过限度可能无法完全恢复。", choices: [["elastic", "弹性力"], ["gravity", "只有重力"], ["light", "光"]], answer: "elastic", visual: visual("beam", "形变观察", "压缩 → 松开", "弹簧", "恢复") }),
    choice({ id: "turn-ball", prompt: "足球向前滚时，从侧面踢一下，最明显会改变什么？", hint: "侧面的力不和原来运动方向相同。", conclusion: "侧向力能改变足球的运动方向", explanation: "力既能改变速度大小，也能改变运动方向。真实足球还会受到摩擦、空气阻力和旋转影响。", choices: [["direction", "运动方向"], ["color", "颜色"], ["mass", "质量"]], answer: "direction", visual: visual("beam", "方向观察", "前进 + 侧向力", "↑", "→", "↗") }),
    choice({ id: "same-push", prompt: "用差不多大的力推空车和装满书的车，哪辆通常更容易加速？", hint: "质量较小的物体在相同合力下加速度更大。", conclusion: "空车通常更容易加速", explanation: "在相似阻力和相同合力下，质量越小，加速度通常越大；装满书的车惯性更大。", choices: [["empty", "空车"], ["full", "装满书的车"], ["same", "一定完全一样"]], answer: "empty", visual: visual("scale", "质量比较", "相同推力", "空车", "满车") }),
    choice({ id: "parachute", prompt: "降落伞张开后，人下降得更慢，主要因为哪种作用变大？", hint: "大伞面会与更多空气相互作用。", conclusion: "张开的降落伞增大了空气阻力", explanation: "更大的迎风面积通常带来更大的空气阻力，使下降速度逐渐达到较低的稳定值。", choices: [["air", "空气阻力"], ["magnet", "磁力"], ["light", "光照"]], answer: "air", visual: visual("beam", "阻力观察", "张开的降落伞", "伞", "空气", "慢") }),
    choice({ id: "inertia", prompt: "在几乎没有摩擦和阻力的太空中，运动物体没有受到合力时会怎样？", hint: "它不需要持续“向前推”才能保持匀速直线运动。", conclusion: "物体会保持原来的匀速直线运动状态", explanation: "这是惯性规律：合力为零时，静止物体保持静止，运动物体保持匀速直线运动。", choices: [["continue", "保持原速度和方向"], ["stop", "立刻停下"], ["faster", "自动越来越快"]], answer: "continue", visual: visual("orbit", "惯性观察", "深空滑行", "物体", "→", "→") }),
  ],
};

const lightShadow: MissionGameDefinition = {
  id: "light-shadow",
  route: "/physics/light-shadow",
  subject: "物理",
  title: "光影追踪",
  mark: "◐",
  subtitle: "移动光束和挡板，追踪影子的方向",
  introduction: "光遇到不同材料会透过、散开、反射或被挡住。观察光源、物体和屏幕的位置关系。",
  accent: "yellow",
  speechLanguage: "zh-CN",
  goals: ["理解光沿直线传播", "分辨材料透光性", "观察影子与反射"],
  missions: [
    choice({ id: "opaque-shadow", prompt: "手电筒照向不透明纸板，纸板后面的屏幕会出现什么？", hint: "纸板挡住了直线前进的光。", conclusion: "不透明物体会在背光侧形成影子", explanation: "光沿近似直线传播，被纸板挡住的区域接收不到直射光，于是形成较暗的影子。", choices: [["shadow", "影子"], ["rainbow", "一定有彩虹"], ["brighter", "比周围更亮"]], answer: "shadow", visual: visual("beam", "遮挡观察", "光源 → 纸板 → 屏幕", "光", "挡板", "影") }),
    choice({ id: "transparent", prompt: "清洁透明玻璃最接近哪种材料？", hint: "大部分可见光能穿过去。", conclusion: "清洁玻璃通常是透明材料", explanation: "透明材料让大部分可见光穿过，能较清楚看到后面的物体；表面仍会反射一小部分光。", choices: [["transparent", "透明"], ["translucent", "半透明"], ["opaque", "不透明"]], answer: "transparent", visual: visual("beam", "透光观察", "光 → 玻璃 →", "光", "玻璃", "透过") }),
    choice({ id: "translucent", prompt: "磨砂玻璃让光通过，但后面的图像模糊。它更像哪一类？", hint: "它既不是完全看不见，也看不清细节。", conclusion: "磨砂玻璃通常属于半透明材料", explanation: "光能穿过半透明材料，但在内部或表面向不同方向散射，所以后面的图像不清楚。", choices: [["opaque", "不透明"], ["translucent", "半透明"], ["mirror", "镜面"]], answer: "translucent", visual: visual("beam", "散射观察", "光 → 磨砂玻璃", "光", "散开", "模糊") }),
    choice({ id: "mirror", prompt: "光照到平整镜面后，最明显会发生什么？", hint: "镜面会把光改变方向送出去。", conclusion: "镜面会有规律地反射光", explanation: "平整镜面产生较规则的反射，入射角和反射角相等，因此能形成清晰镜像。", choices: [["reflect", "反射"], ["vanish", "完全消失"], ["mass", "变重"]], answer: "reflect", visual: visual("beam", "反射观察", "入射光 ↘ 镜面 ↗", "光", "镜", "反射") }),
    choice({ id: "closer-lamp", prompt: "物体向小光源靠近、屏幕位置不变时，影子通常怎样变化？", hint: "物体会挡住从光源发散出的更大角度。", conclusion: "物体靠近小光源时，屏幕上的影子通常变大", explanation: "点状或较小光源发出的光向外发散，物体越靠近光源，挡住的光束范围通常越大。", choices: [["bigger", "变大"], ["smaller", "变小"], ["none", "一定消失"]], answer: "bigger", visual: visual("beam", "影子大小", "光 · 物体 · 屏幕", "近", "大影子") }),
    choice({ id: "shadow-opposite", prompt: "太阳在物体左边时，影子主要会伸向哪边？", hint: "影子出现在光被挡住的背光一侧。", conclusion: "影子通常伸向太阳相反的方向", explanation: "太阳光近似平行照来，物体挡住光后，影子落在背离太阳的一侧。", choices: [["right", "右边"], ["left", "太阳那边"], ["up", "只向天空"]], answer: "right", visual: visual("beam", "方向观察", "太阳 → 物体 → 影子", "左", "物体", "右") }),
    choice({ id: "straight", prompt: "小孔成像和清楚影子都能帮助说明光怎样传播？", hint: "在均匀介质中，光不会随意拐弯绕过挡板。", conclusion: "光在均匀介质中沿直线传播", explanation: "光线模型用直线表示传播方向；遇到不同介质、反射面或引力等情况时，路径可能改变。", choices: [["straight", "近似沿直线"], ["random", "随意乱飞"], ["still", "完全不传播"]], answer: "straight", visual: visual("beam", "路径观察", "小孔光束", "•", "——", "屏幕") }),
    choice({ id: "two-lights", prompt: "两个分开的小灯同时照一个不透明物体，可能出现什么？", hint: "每个光源都能产生自己的遮挡区域。", conclusion: "多个光源可能形成多个影子或深浅不同的影区", explanation: "两个光源方向不同，会产生重叠和不重叠的遮挡区域，因此常能看到多个影子或半影。", choices: [["multiple", "多个影区"], ["none", "一定没有影子"], ["one-always", "永远只有一个同样深的影子"]], answer: "multiple", visual: visual("beam", "多光源观察", "两盏灯 · 一个物体", "灯", "物", "灯") }),
    choice({ id: "rough-reflection", prompt: "光照到粗糙白墙后为什么各个方向都能看到墙？", hint: "墙面微小起伏让反射方向分散。", conclusion: "粗糙表面会产生漫反射", explanation: "每个微小表面仍遵循反射规律，但朝向不同，使反射光分散到很多方向。", choices: [["diffuse", "漫反射"], ["absorb-all", "吸收全部光"], ["laser", "只变成一束激光"]], answer: "diffuse", visual: visual("beam", "表面观察", "光 → 粗糙墙面", "↖", "↑", "↗") }),
    choice({ id: "dark-color", prompt: "在白光下看到红色积木，主要因为它把哪部分光更多地送到眼睛？", hint: "物体的颜色与反射到眼睛的可见光有关。", conclusion: "红色积木更多反射红色光", explanation: "白光包含多种颜色成分，红色表面通常更多反射红光、吸收其他一些颜色，因此我们看到红色。", choices: [["red", "红色光"], ["sound", "声音"], ["gravity", "重力"]], answer: "red", visual: visual("beam", "颜色观察", "白光 → 红积木 → 眼睛", "白光", "红光") }),
  ],
};

const solarRoute: MissionGameDefinition = {
  id: "solar-route",
  route: "/universe/solar-system",
  subject: "宇宙",
  title: "太阳系航线",
  mark: "◎",
  subtitle: "沿着轨道认识太阳、行星和月球",
  introduction: "从离太阳最近的行星出发，认识太阳系里的邻居。画面是教学示意，距离和大小不会假装成真实比例。",
  accent: "orange",
  speechLanguage: "zh-CN",
  goals: ["认识太阳系成员", "排出行星顺序", "理解自转和公转"],
  missions: [
    choice({ id: "sun-star", prompt: "太阳属于哪一类天体？", hint: "它能自己发出大量光和热。", conclusion: "太阳是一颗恒星", explanation: "太阳是太阳系中心的恒星，能量主要来自核心的核聚变。行星主要反射太阳光。", choices: [["star", "恒星"], ["planet", "行星"], ["moon", "卫星"]], answer: "star", visual: visual("orbit", "天体身份", "太阳", "恒星", "光", "热") }),
    choice({ id: "mercury", prompt: "离太阳最近的行星是哪一颗？", hint: "它排在八大行星航线的第一站。", conclusion: "水星离太阳最近", explanation: "从太阳向外，第一颗行星是水星；它绕太阳一周的时间也是八大行星中最短的。", choices: [["mercury", "水星"], ["venus", "金星"], ["earth", "地球"]], answer: "mercury", visual: visual("orbit", "第一轨道", "太阳 · 水星", "☉", "1", "水星") }),
    choice({ id: "largest", prompt: "太阳系八大行星中，体积最大的是哪一颗？", hint: "它是一颗巨大的气态巨行星。", conclusion: "木星是太阳系最大的行星", explanation: "木星的直径和质量都远大于地球，主要由氢和氦组成，并拥有强大的磁场。", choices: [["earth", "地球"], ["jupiter", "木星"], ["mars", "火星"]], answer: "jupiter", visual: visual("orbit", "大小比较", "八大行星之最", "木星", "最大") }),
    choice({ id: "red-planet", prompt: "哪颗行星常被称为“红色星球”？", hint: "表面的含铁矿物氧化后呈现红褐色。", conclusion: "火星常被称为红色星球", explanation: "火星表面的氧化铁尘埃让它整体呈红褐色；它有稀薄大气和极地冰盖。", choices: [["mars", "火星"], ["neptune", "海王星"], ["venus", "金星"]], answer: "mars", visual: visual("orbit", "颜色线索", "红色星球", "火星", "氧化铁") }),
    choice({ id: "rings", prompt: "哪颗行星拥有非常醒目的宽广光环？", hint: "其他巨行星也有环，但它的环最容易辨认。", conclusion: "土星拥有最醒目的行星环", explanation: "土星环由大量冰粒、岩石碎屑和尘埃组成，并不是一整块实心圆盘。", choices: [["saturn", "土星"], ["mercury", "水星"], ["earth", "地球"]], answer: "saturn", visual: visual("orbit", "行星特征", "土星光环", "土星", "冰粒", "碎屑") }),
    choice({ id: "moon", prompt: "月球和地球是什么关系？", hint: "月球主要绕地球运行。", conclusion: "月球是地球的天然卫星", explanation: "月球绕地球公转，也和地球一起绕太阳运动；月光主要是反射的太阳光。", choices: [["satellite", "天然卫星"], ["star", "恒星"], ["galaxy", "星系"]], answer: "satellite", visual: visual("orbit", "地月关系", "地球 · 月球", "地球", "月球") }),
    choice({ id: "day-night", prompt: "地球上昼夜交替主要是因为地球在做什么？", hint: "地球大约一天转一圈。", conclusion: "地球自转带来昼夜交替", explanation: "地球绕自转轴旋转，一侧朝向太阳时是白天，背向太阳时是夜晚。", choices: [["rotate", "自转"], ["revolve", "只因为公转"], ["moon", "月球发光"]], answer: "rotate", visual: visual("orbit", "昼夜观察", "地球自转", "白天", "地球", "夜晚") }),
    choice({ id: "year", prompt: "地球上的“一年”主要对应哪段运动？", hint: "地球沿轨道绕太阳走一圈。", conclusion: "一年对应地球绕太阳公转一周", explanation: "地球公转一周约 365.24 天；历法通过闰年等方式与实际公转周期保持接近。", choices: [["revolve", "绕太阳公转一周"], ["rotate", "自转一周"], ["moon", "月球自转一周"]], answer: "revolve", visual: visual("orbit", "时间与轨道", "地球的一年", "太阳", "轨道", "地球") }),
    choice({ id: "earth-third", prompt: "地球是离太阳第几近的行星？", hint: "水星第一，金星第二。", conclusion: "地球是太阳系第三颗行星", explanation: "从太阳向外依次是水星、金星、地球、火星、木星、土星、天王星、海王星。", choices: [["two", "第二"], ["three", "第三"], ["four", "第四"]], answer: "three", visual: visual("orbit", "轨道位置", "地球", "1 水星", "2 金星", "3 地球") }),
    sequence({ id: "inner-order", prompt: "从离太阳最近开始，按顺序点亮四颗类地行星。", hint: "先是水星和金星，然后才到我们的地球。", conclusion: "四颗类地行星依次是水星、金星、地球、火星", explanation: "这四颗内侧行星都有固体表面，称为类地行星；它们的环境却各不相同。", choices: [["earth", "地球"], ["mars", "火星"], ["mercury", "水星"], ["venus", "金星"]], answer: ["mercury", "venus", "earth", "mars"], visual: visual("sequence", "轨道排序", "太阳向外", "水星", "金星", "地球", "火星") }),
  ],
};

const numberWar: MissionGameDefinition = {
  id: "number-war",
  route: "/game/number-war",
  subject: "游戏",
  title: "数字战争",
  mark: "⚡",
  subtitle: "比较、组合、观察，让数字飞船充满能量",
  introduction: "这不是攻击游戏。两艘数字飞船会带来不同数值，木木用数感判断哪边能量更多、怎样组合更合适。",
  accent: "pink",
  speechLanguage: "zh-CN",
  goals: ["快速比较大小", "练习凑十与位值", "发现单双数和数列"],
  missions: [
    choice({ id: "compare-47-74", prompt: "47 和 74，哪艘数字飞船的能量更多？", hint: "先比较十位，4 个十和 7 个十谁更多？", conclusion: "74 比 47 大", explanation: "比较两位数先看十位：74 有 7 个十，47 有 4 个十，所以 74 更大。", choices: [["47", "47"], ["74", "74"]], answer: "74", visual: visual("number", "能量比较", "47  ?  74", "47", "74") }),
    choice({ id: "make-ten", prompt: "数字 6 和哪个数合在一起正好得到 10？", hint: "从 6 继续数到 10，还要走几步？", conclusion: "6 + 4 = 10", explanation: "把 10 分成 6 和 4，是重要的凑十组合；熟悉凑十能帮助快速加法。", choices: [["3", "3"], ["4", "4"], ["5", "5"]], answer: "4", visual: visual("number", "凑十能量", "6 + ? = 10", "6", "?", "10") }),
    choice({ id: "closest-ten", prompt: "8、17、26 中，哪个数离 20 最近？", hint: "分别看看它们和 20 相差多少。", conclusion: "17 离 20 最近，只差 3", explanation: "8 和 20 差 12，17 差 3，26 差 6；差最小的数离目标最近。", choices: [["8", "8"], ["17", "17"], ["26", "26"]], answer: "17", visual: visual("scale", "距离比较", "离 20 最近", "8", "17", "20", "26") }),
    choice({ id: "even", prompt: "下面哪个数可以两个两个地分完，没有剩余？", hint: "个位是 0、2、4、6、8 的整数是偶数。", conclusion: "18 是偶数", explanation: "18 可以分成 9 组，每组 2 个，没有剩余；15 和 21 都是奇数。", choices: [["15", "15"], ["18", "18"], ["21", "21"]], answer: "18", visual: visual("number", "单双数", "两两组队", "18", "2 × 9") }),
    choice({ id: "place-value", prompt: "数字 63 里的 6 表示什么？", hint: "6 在十位上。", conclusion: "63 中的 6 表示 6 个十，也就是 60", explanation: "十位上的数字表示有几个十，个位上的数字表示有几个一；63 = 60 + 3。", choices: [["six", "6 个一"], ["sixty", "6 个十"], ["six-hundred", "6 个百"]], answer: "sixty", visual: visual("number", "位值观察", "63", "6 个十", "3 个一") }),
    choice({ id: "hundred", prompt: "99 再增加 1，会变成多少？", hint: "9 个一加 1 个一会凑成新的一个十。", conclusion: "99 + 1 = 100", explanation: "个位凑成十向十位进一，十位又凑成十向百位进一，所以得到 1 个百。", choices: [["100", "100"], ["90", "90"], ["991", "991"]], answer: "100", visual: visual("number", "跨越整百", "99 + 1", "99", "+1", "100") }),
    choice({ id: "half", prompt: "100 的一半是多少？", hint: "把 100 平均分成两份。", conclusion: "100 的一半是 50", explanation: "50 + 50 = 100，所以把 100 平均分成两份，每份是 50。", choices: [["25", "25"], ["50", "50"], ["75", "75"]], answer: "50", visual: visual("scale", "平均分", "100 ÷ 2", "50", "50") }),
    choice({ id: "sequence-five", prompt: "5、10、15、20，下一艘飞船应该是多少？", hint: "每次都增加相同的数。", conclusion: "每次加 5，所以下一个是 25", explanation: "这个数列按 5 递增：5、10、15、20、25。它也对应 5 的倍数。", choices: [["21", "21"], ["25", "25"], ["30", "30"]], answer: "25", visual: visual("sequence", "数列能量", "5 · 10 · 15 · 20 · ?", "5", "10", "15", "20", "?") }),
    choice({ id: "sum-choice", prompt: "哪一组数字合起来的能量是 12？", hint: "分别把每组两个数相加。", conclusion: "7 和 5 合起来是 12", explanation: "7 + 5 可以先把 5 分成 3 和 2：7 + 3 = 10，再加 2 得 12。", choices: [["7-5", "7 和 5"], ["8-3", "8 和 3"], ["6-4", "6 和 4"]], answer: "7-5", visual: visual("number", "组合能量", "? + ? = 12", "7", "5", "12") }),
    sequence({ id: "order-four", prompt: "把四艘飞船按能量从小到大依次点亮。", hint: "先找最小的个位数，再比较两个两位数。", conclusion: "从小到大是 9、19、29、90", explanation: "先看位数，再看十位和个位；两位数一定大于这里的一位数 9，90 的十位最大。", choices: [["29", "29"], ["9", "9"], ["90", "90"], ["19", "19"]], answer: ["9", "19", "29", "90"], visual: visual("sequence", "舰队排序", "从小到大", "9", "19", "29", "90") }),
  ],
};

const patternDetective: MissionGameDefinition = {
  id: "pattern-detective",
  route: "/math/pattern-detective",
  subject: "数学",
  title: "规律侦探",
  mark: "◇",
  subtitle: "找出重复、递增和交替留下的线索",
  introduction: "规律像一条看不见的轨道。观察每一步发生了什么，就能推理下一项应该出现谁。",
  accent: "violet",
  speechLanguage: "zh-CN",
  goals: ["观察重复结构", "发现固定变化", "用语言说出规律"],
  missions: [
    choice({ id: "even-step", prompt: "2、4、6，下一项是什么？", hint: "每次都增加 2。", conclusion: "下一项是 8", explanation: "这是每次加 2 的递增规律：2、4、6、8，也是一段连续偶数。", choices: [["7", "7"], ["8", "8"], ["10", "10"]], answer: "8", visual: visual("sequence", "递增线索", "2 · 4 · 6 · ?", "2", "4", "6", "?") }),
    choice({ id: "odd-step", prompt: "1、3、5，下一项是什么？", hint: "每次都增加 2。", conclusion: "下一项是 7", explanation: "这是连续奇数的一部分，每次增加 2：1、3、5、7。", choices: [["6", "6"], ["7", "7"], ["8", "8"]], answer: "7", visual: visual("sequence", "递增线索", "1 · 3 · 5 · ?", "1", "3", "5", "?") }),
    choice({ id: "color-ab", prompt: "青、粉、青、粉，下一项是什么颜色？", hint: "两种颜色轮流出现。", conclusion: "下一项是青色", explanation: "这是 AB 交替规律：青、粉不断重复；粉色后面重新回到青色。", choices: [["cyan", "青色"], ["pink", "粉色"], ["yellow", "黄色"]], answer: "cyan", visual: visual("sequence", "交替线索", "青 · 粉 · 青 · 粉 · ?", "青", "粉", "青", "粉", "?") }),
    choice({ id: "down-one", prompt: "10、9、8、7，下一项是什么？", hint: "每次都减少 1。", conclusion: "下一项是 6", explanation: "这是每次减 1 的递减规律：10、9、8、7、6。", choices: [["5", "5"], ["6", "6"], ["8", "8"]], answer: "6", visual: visual("sequence", "递减线索", "10 · 9 · 8 · 7 · ?", "10", "9", "8", "7", "?") }),
    choice({ id: "double", prompt: "1、2、4、8，下一项是什么？", hint: "每一项都是前一项的两倍。", conclusion: "下一项是 16", explanation: "这个规律是每次乘 2：1、2、4、8、16，数增长得越来越快。", choices: [["10", "10"], ["12", "12"], ["16", "16"]], answer: "16", visual: visual("sequence", "倍增线索", "1 · 2 · 4 · 8 · ?", "×2", "×2", "×2") }),
    choice({ id: "add-five", prompt: "5、10、15、20，下一项是什么？", hint: "每次增加 5。", conclusion: "下一项是 25", explanation: "每相邻两项都相差 5，因此 20 再加 5 得到 25。", choices: [["21", "21"], ["24", "24"], ["25", "25"]], answer: "25", visual: visual("sequence", "固定步长", "5 · 10 · 15 · 20 · ?", "+5", "+5", "+5") }),
    choice({ id: "shape-aab", prompt: "圆、圆、三角，圆、圆、三角，下一项是什么？", hint: "每三项是一组。", conclusion: "下一项是圆", explanation: "重复单元是“圆、圆、三角”。第二组结束后，第三组重新从圆开始。", choices: [["circle", "圆"], ["triangle", "三角"], ["square", "方形"]], answer: "circle", visual: visual("sequence", "分组重复", "○ ○ △ · ○ ○ △ · ?", "○", "○", "△") }),
    choice({ id: "alternating-action", prompt: "跳、拍手、跳、拍手，下一项动作是什么？", hint: "两个动作轮流出现。", conclusion: "下一项是跳", explanation: "这是两个动作交替的规律。用身体做一遍，也能更容易感受到节奏。", choices: [["jump", "跳"], ["clap", "拍手"], ["turn", "转圈"]], answer: "jump", visual: visual("sequence", "动作节奏", "跳 · 拍 · 跳 · 拍 · ?", "跳", "拍", "跳", "拍") }),
    choice({ id: "grow-two", prompt: "3、6、9、12，下一项是什么？", hint: "相邻两项都相差 3。", conclusion: "下一项是 15", explanation: "这个数列每次加 3，也是 3 的连续倍数：3、6、9、12、15。", choices: [["13", "13"], ["14", "14"], ["15", "15"]], answer: "15", visual: visual("sequence", "递增线索", "3 · 6 · 9 · 12 · ?", "+3", "+3", "+3") }),
    sequence({ id: "size-order", prompt: "按“最小 → 中等 → 最大”的规律依次点亮三个圆。", hint: "先找占空间最少的，再找最大的。", conclusion: "正确顺序是小圆、中圆、大圆", explanation: "这个规律改变的是图形大小，形状和颜色保持不变；观察单一变化更容易找到规律。", choices: [["large", "大圆"], ["small", "小圆"], ["medium", "中圆"]], answer: ["small", "medium", "large"], visual: visual("sequence", "大小变化", "○  ◯  ◉", "小", "中", "大") }),
  ],
};

const bodyStation: MissionGameDefinition = {
  id: "body-station",
  route: "/biology/body-station",
  subject: "生命",
  title: "人体探索站",
  mark: "♥",
  subtitle: "认识身体里一直认真工作的伙伴",
  introduction: "心脏、肺、脑、骨骼和肌肉每天都在合作。这里介绍正常身体功能，不做疾病诊断，也不制造害怕。",
  accent: "pink",
  speechLanguage: "zh-CN",
  goals: ["认识重要器官", "理解身体合作", "建立健康好奇心"],
  missions: [
    choice({ id: "heart", prompt: "哪个器官像泵一样推动血液流动？", hint: "它会有节律地收缩和舒张。", conclusion: "心脏推动血液在血管中循环", explanation: "心脏由肌肉组织构成，通过有节律的收缩把血液送往肺和全身。", choices: [["heart", "心脏"], ["stomach", "胃"], ["bone", "骨骼"]], answer: "heart", visual: visual("body", "器官任务", "心脏", "收缩", "血液", "循环") }),
    choice({ id: "lungs", prompt: "吸气时，空气主要进入哪个器官完成气体交换？", hint: "它们位于胸腔中，左右各有一部分。", conclusion: "肺负责重要的气体交换", explanation: "空气进入肺后，氧气通过肺泡进入血液，血液中的一部分二氧化碳进入肺并随呼气排出。", choices: [["lungs", "肺"], ["brain", "脑"], ["skin", "皮肤"]], answer: "lungs", visual: visual("body", "呼吸任务", "肺", "氧气", "二氧化碳") }),
    choice({ id: "brain", prompt: "哪个器官负责处理感觉、思考并协调身体活动？", hint: "它位于头部，和脊髓、神经一起工作。", conclusion: "脑是神经系统的重要控制中心", explanation: "脑接收和处理大量信息，帮助我们学习、记忆、运动和感受；身体许多自动活动也由神经系统调节。", choices: [["brain", "脑"], ["heart", "心脏"], ["teeth", "牙齿"]], answer: "brain", visual: visual("body", "控制任务", "脑", "感觉", "思考", "动作") }),
    choice({ id: "stomach", prompt: "食物经过食管后，通常先进入哪个袋状器官？", hint: "它会暂时储存并搅拌食物。", conclusion: "食物经过食管进入胃", explanation: "胃通过肌肉运动和胃液帮助消化食物，之后内容物逐渐进入小肠继续消化吸收。", choices: [["stomach", "胃"], ["lungs", "肺"], ["ear", "耳"]], answer: "stomach", visual: visual("body", "消化任务", "胃", "食物", "搅拌", "消化") }),
    choice({ id: "bones", prompt: "身体里的骨骼最重要的作用之一是什么？", hint: "它像身体内部的支架。", conclusion: "骨骼支撑身体并保护一些重要器官", explanation: "骨骼提供支撑，和肌肉、关节一起帮助运动；头骨、胸廓等还能保护重要器官。", choices: [["support", "支撑和保护"], ["digest", "直接消化食物"], ["see", "看见光"]], answer: "support", visual: visual("body", "身体支架", "骨骼", "支撑", "保护", "运动") }),
    choice({ id: "muscle", prompt: "我们弯曲手臂时，肌肉主要通过什么方式产生动作？", hint: "肌肉能主动变短并产生拉力。", conclusion: "肌肉收缩，通过肌腱拉动骨骼", explanation: "骨骼肌通常跨过关节附着在骨上，一组肌肉收缩、另一组配合放松，帮助关节运动。", choices: [["contract", "收缩并拉动"], ["push-bone", "从内部吹气"], ["light", "发光"]], answer: "contract", visual: visual("body", "运动伙伴", "肌肉 + 骨骼", "收缩", "拉动") }),
    choice({ id: "eyes", prompt: "眼睛首先接收哪一种信息，帮助我们看见？", hint: "没有这种信息，在完全黑暗中很难看清。", conclusion: "眼睛接收光信息", explanation: "光进入眼睛后在视网膜形成信号，再通过视神经传给脑进行处理。", choices: [["light", "光"], ["smell", "气味"], ["gravity", "重力"]], answer: "light", visual: visual("body", "感觉任务", "眼睛", "光", "视网膜", "脑") }),
    choice({ id: "ears", prompt: "耳朵接收空气中的什么变化，帮助我们听见？", hint: "发声物体会让周围介质振动。", conclusion: "耳朵接收声波引起的振动", explanation: "声波使鼓膜振动，振动经过中耳和内耳转成神经信号，再由脑理解为声音。", choices: [["sound", "声波振动"], ["color", "颜色"], ["taste", "味道"]], answer: "sound", visual: visual("body", "听觉任务", "耳朵", "振动", "信号", "脑") }),
    choice({ id: "skin", prompt: "人体最大的器官是哪一个？", hint: "它覆盖身体表面。", conclusion: "皮肤是人体最大的器官", explanation: "皮肤形成保护屏障，也参与触觉和体温调节；需要保持清洁并避免过度暴晒。", choices: [["skin", "皮肤"], ["heart", "心脏"], ["eye", "眼睛"]], answer: "skin", visual: visual("body", "保护任务", "皮肤", "屏障", "触觉", "体温") }),
    sequence({ id: "food-path", prompt: "把食物经过的前四站按顺序点亮。", hint: "先从嘴进入，再沿一条管道到胃，之后来到小肠。", conclusion: "食物依次经过口腔、食管、胃和小肠", explanation: "消化道还有更多部分；这四站展示了食物进入身体后的主要前段路径。", choices: [["stomach", "胃"], ["mouth", "口腔"], ["intestine", "小肠"], ["esophagus", "食管"]], answer: ["mouth", "esophagus", "stomach", "intestine"], visual: visual("sequence", "消化路线", "食物的前四站", "口腔", "食管", "胃", "小肠") }),
  ],
};

const cellUniverse: MissionGameDefinition = {
  id: "cell-universe",
  route: "/biology/cell-universe",
  subject: "生命",
  title: "细胞小宇宙",
  mark: "◉",
  subtitle: "走进生命的微小结构，认识细胞伙伴",
  introduction: "细胞非常小，真实形状也很多样。这里的图形是帮助理解结构的教学示意，不是显微镜照片。",
  accent: "green",
  speechLanguage: "zh-CN",
  goals: ["认识细胞基本结构", "比较动植物细胞", "理解细胞组成生命体"],
  missions: [
    choice({ id: "nucleus", prompt: "细胞中保存大部分遗传信息、参与控制活动的结构是什么？", hint: "在常见教学图里，它常画在细胞内部。", conclusion: "细胞核保存大部分遗传信息", explanation: "真核细胞的细胞核内含大部分 DNA，并通过基因表达参与调控细胞活动。", choices: [["nucleus", "细胞核"], ["membrane", "细胞膜"], ["wall", "细胞壁"]], answer: "nucleus", visual: visual("cell", "细胞结构", "细胞核", "DNA", "控制") }),
    choice({ id: "membrane", prompt: "哪层结构包围所有细胞，并调节物质进出？", hint: "动物细胞和植物细胞都有它。", conclusion: "细胞膜包围细胞并调节物质进出", explanation: "细胞膜把细胞内部与外界分开，能选择性地让一些物质通过，并参与信息交流。", choices: [["membrane", "细胞膜"], ["chloroplast", "叶绿体"], ["bone", "骨骼"]], answer: "membrane", visual: visual("cell", "细胞边界", "细胞膜", "里面", "选择进出", "外面") }),
    choice({ id: "cytoplasm", prompt: "细胞膜以内、细胞核以外的许多活动发生在哪个区域？", hint: "它包含细胞质基质和多种细胞器。", conclusion: "许多细胞活动发生在细胞质中", explanation: "细胞质是细胞内部的重要区域，包含细胞质基质和多种细胞器，进行着大量化学反应。", choices: [["cytoplasm", "细胞质"], ["air", "空气"], ["shell", "贝壳"]], answer: "cytoplasm", visual: visual("cell", "内部空间", "细胞质", "反应", "运输") }),
    choice({ id: "chloroplast", prompt: "植物细胞中，哪种结构能利用光能进行光合作用？", hint: "它含有叶绿素，常让叶片呈绿色。", conclusion: "叶绿体是光合作用的重要场所", explanation: "叶绿体利用光能，把二氧化碳和水转化为有机物并释放氧气；并非所有植物细胞都有叶绿体。", choices: [["chloroplast", "叶绿体"], ["nucleus", "细胞核"], ["rib", "肋骨"]], answer: "chloroplast", visual: visual("cell", "能量工厂", "叶绿体", "光", "CO₂", "有机物") }),
    choice({ id: "wall", prompt: "植物细胞在细胞膜外通常还有哪层较坚固的结构？", hint: "它能提供支撑，但不是动物骨骼。", conclusion: "植物细胞通常有细胞壁", explanation: "植物细胞壁主要由纤维素等组成，提供支撑和保护；细胞膜仍位于细胞壁内侧。", choices: [["wall", "细胞壁"], ["skin", "皮肤"], ["shell", "蛋壳"]], answer: "wall", visual: visual("cell", "植物边界", "细胞壁 + 细胞膜", "外层", "内层") }),
    choice({ id: "vacuole", prompt: "成熟植物细胞中，哪个结构常常很大，能储存水和多种物质？", hint: "它还能帮助维持细胞的膨压。", conclusion: "成熟植物细胞常有大型中央液泡", explanation: "中央液泡储存水、离子和其他物质，并通过膨压帮助植物组织保持挺立。", choices: [["vacuole", "液泡"], ["lung", "肺"], ["mirror", "镜面"]], answer: "vacuole", visual: visual("cell", "储存空间", "中央液泡", "水", "物质", "膨压") }),
    choice({ id: "mitochondria", prompt: "哪种细胞器参与把营养物中的能量转化为细胞可用的形式？", hint: "它常被称作细胞的“能量站”，但不是真的发电厂。", conclusion: "线粒体是细胞呼吸的重要场所", explanation: "线粒体通过细胞呼吸过程生成大量 ATP，为多种细胞活动提供可用能量。", choices: [["mitochondria", "线粒体"], ["wall", "细胞壁"], ["hair", "头发"]], answer: "mitochondria", visual: visual("cell", "能量转换", "线粒体", "营养物", "ATP") }),
    choice({ id: "animal-no-chloroplast", prompt: "普通动物细胞通常没有哪种结构？", hint: "动物不能像绿色植物那样用叶绿体进行光合作用。", conclusion: "普通动物细胞通常没有叶绿体", explanation: "动物细胞通常有细胞膜、细胞质、细胞核和线粒体等，但没有叶绿体与典型纤维素细胞壁。", choices: [["chloroplast", "叶绿体"], ["membrane", "细胞膜"], ["cytoplasm", "细胞质"]], answer: "chloroplast", visual: visual("cell", "动植物比较", "动物细胞", "细胞膜", "细胞核", "无叶绿体") }),
    choice({ id: "microscope", prompt: "大多数细胞太小，通常需要什么工具帮助观察？", hint: "它能把很小的结构放大。", conclusion: "显微镜帮助人们观察细胞", explanation: "光学显微镜和电子显微镜使用不同原理与尺度观察微小结构；看到的样品还需要正确制备和解释。", choices: [["microscope", "显微镜"], ["ruler", "直尺"], ["clock", "时钟"]], answer: "microscope", visual: visual("cell", "观察工具", "显微镜", "放大", "细胞") }),
    sequence({ id: "levels", prompt: "从小到大，把生命结构层级依次点亮。", hint: "许多相似细胞先组成组织，组织再组成器官。", conclusion: "细胞、组织、器官、器官系统依次组成更大层级", explanation: "多细胞生物中，细胞组成组织，组织组成器官，多个器官协作形成器官系统。", choices: [["organ", "器官"], ["cell", "细胞"], ["system", "器官系统"], ["tissue", "组织"]], answer: ["cell", "tissue", "organ", "system"], visual: visual("sequence", "生命层级", "从小到大", "细胞", "组织", "器官", "系统") }),
  ],
};

export const MISSION_GAME_DEFINITIONS: readonly MissionGameDefinition[] = [
  experimentMaster,
  matterWorld,
  wordOrbit,
  unitMagic,
  forceLab,
  lightShadow,
  solarRoute,
  numberWar,
  patternDetective,
  bodyStation,
  cellUniverse,
];

export const MISSION_GAME_BY_ID = new Map<MissionGameId, MissionGameDefinition>(
  MISSION_GAME_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export const MISSION_GAME_BY_ROUTE = new Map<string, MissionGameDefinition>(
  MISSION_GAME_DEFINITIONS.map((definition) => [definition.route, definition]),
);
