export type PuzzleKind =
  | "sum-difference"
  | "stack-add"
  | "height-difference"
  | "double-plus"
  | "triple-plus"
  | "share-two"
  | "share-three"
  | "double-and-single";

export type ActorId = "tom" | "jerry" | "spike";
export type PuzzleUnit = "厘米" | "块";
export type PuzzleComplexity = "观察加减" | "乘除思考";

export type PuzzleGiven = {
  label: string;
  value: number;
  unit: PuzzleUnit;
};

export type SolutionStep = {
  formula: string;
  explanation: string;
};

export type PuzzleVisual = {
  kind: PuzzleKind;
  backgroundId: string;
  layoutVariant: 1 | 2 | 3 | 4;
  actor: ActorId;
  actorSprite: string;
  partnerActor?: ActorId;
  partnerSprite?: string;
  referenceSprite: string;
  accentSprite: string;
  factor?: 2 | 3;
};

export type CatMousePuzzle = {
  id: string;
  kind: PuzzleKind;
  complexity: PuzzleComplexity;
  title: string;
  story: string;
  question: string;
  unknownName: string;
  unit: PuzzleUnit;
  answer: number;
  equations: string[];
  solutionSteps: SolutionStep[];
  answerSentence: string;
  givens: PuzzleGiven[];
  numbers: Record<string, number>;
  divisor?: 2 | 3;
  visual: PuzzleVisual;
};

export const PUZZLE_KINDS: readonly PuzzleKind[] = [
  "sum-difference",
  "stack-add",
  "height-difference",
  "double-plus",
  "triple-plus",
  "share-two",
  "share-three",
  "double-and-single",
] as const;

export const CAT_MOUSE_BACKGROUNDS = [
  "background-living-room",
  "background-kitchen",
  "background-dining-room",
  "background-hallway-stairs",
  "background-basement-boiler",
  "background-backyard",
  "background-city-alley",
  "background-harbor-dock",
] as const;

const ACTOR_LABELS: Record<ActorId, string> = {
  tom: "汤姆",
  jerry: "杰瑞",
  spike: "斯派克",
};

const ACTOR_SPRITES: Record<ActorId, readonly string[]> = {
  tom: [
    "tom-alert-idle",
    "tom-tiptoe-sneak",
    "tom-chase-run",
    "tom-pounce",
    "tom-startled",
    "tom-angry-point",
  ],
  jerry: [
    "jerry-clever-idle",
    "jerry-tiptoe-sneak",
    "jerry-escape-run",
    "jerry-dodge-jump",
    "jerry-laugh",
    "jerry-tease",
  ],
  spike: [
    "spike-guard-idle",
    "spike-patrol-walk",
    "spike-charge-run",
    "spike-intercept",
    "spike-angry-bark",
    "spike-warning",
  ],
};

const TALL_REFERENCES = [
  "measure-rock-tall",
  "measure-post-tall",
  "measure-crates-three",
  "measure-ladder",
] as const;

const STACK_REFERENCES = [
  "measure-rock-short",
  "measure-crate-one",
  "measure-barrel",
  "measure-table",
] as const;

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function randomInteger(minimum: number, maximum: number, random: () => number) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function pickActor(random: () => number, excluded?: ActorId): ActorId {
  const actors = (["tom", "jerry", "spike"] as const).filter((actor) => actor !== excluded);
  return pick(actors, random);
}

function visualBase(
  kind: PuzzleKind,
  random: () => number,
  actor = pickActor(random),
): PuzzleVisual {
  return {
    kind,
    backgroundId: pick(CAT_MOUSE_BACKGROUNDS, random),
    layoutVariant: randomInteger(1, 4, random) as 1 | 2 | 3 | 4,
    actor,
    actorSprite: pick(ACTOR_SPRITES[actor], random),
    referenceSprite: pick(TALL_REFERENCES, random),
    accentSprite: "prop-cheese-wedge",
  };
}

function sumDifferencePuzzle(random: () => number): CatMousePuzzle {
  const answer = randomInteger(24, 68, random);
  const objectHeight = randomInteger(answer + 12, Math.min(132, 200 - answer), random);
  const difference = objectHeight - answer;
  const total = objectHeight + answer;
  const visual = visualBase("sum-difference", random, "jerry");
  return {
    id: `sum-difference-${difference}-${total}-${visual.backgroundId}`,
    kind: "sum-difference",
    complexity: "观察加减",
    title: "石柱上下藏着两个线索",
    story: `杰瑞站在参照物旁边时，顶端比杰瑞高 ${difference} 厘米；杰瑞站到顶端以后，从地面到头顶一共 ${total} 厘米。`,
    question: "杰瑞的身高是多少厘米？",
    unknownName: "杰瑞的身高",
    unit: "厘米",
    answer,
    equations: [`a - x = ${difference}`, `a + x = ${total}`],
    solutionSteps: [
      { formula: `${total} - ${difference} = ${answer * 2}`, explanation: "两条线索相减，参照物被抵消，剩下两个杰瑞。" },
      { formula: `${answer * 2} ÷ 2 = ${answer}`, explanation: "把两个杰瑞平均分成两份。" },
    ],
    answerSentence: `杰瑞的身高是 ${answer} 厘米。`,
    givens: [
      { label: "顶端与杰瑞的高度差", value: difference, unit: "厘米" },
      { label: "站到顶端后的总高度", value: total, unit: "厘米" },
    ],
    numbers: { answer, objectHeight, difference, total },
    divisor: 2,
    visual,
  };
}

function stackAddPuzzle(random: () => number): CatMousePuzzle {
  const answer = randomInteger(18, 86, random);
  const baseHeight = randomInteger(12, Math.min(96, 200 - answer), random);
  const total = baseHeight + answer;
  const visual = visualBase("stack-add", random);
  visual.referenceSprite = pick(STACK_REFERENCES, random);
  const actorName = ACTOR_LABELS[visual.actor];
  return {
    id: `stack-add-${baseHeight}-${total}-${visual.actor}-${visual.backgroundId}`,
    kind: "stack-add",
    complexity: "观察加减",
    title: "站上台子以后有多高？",
    story: `台子高 ${baseHeight} 厘米，${actorName}站上去以后，从地面到头顶一共 ${total} 厘米。`,
    question: `${actorName}本身高多少厘米？`,
    unknownName: `${actorName}的身高`,
    unit: "厘米",
    answer,
    equations: [`${baseHeight} + x = ${total}`],
    solutionSteps: [
      { formula: `x = ${total} - ${baseHeight}`, explanation: "总高度减去台子的高度，就是角色本身的高度。" },
      { formula: `x = ${answer}`, explanation: "完成减法，找到未知数。" },
    ],
    answerSentence: `${actorName}的身高是 ${answer} 厘米。`,
    givens: [
      { label: "台子高度", value: baseHeight, unit: "厘米" },
      { label: "站上去后的总高度", value: total, unit: "厘米" },
    ],
    numbers: { answer, baseHeight, total },
    visual,
  };
}

function heightDifferencePuzzle(random: () => number): CatMousePuzzle {
  const knownHeight = randomInteger(18, 92, random);
  const difference = randomInteger(6, Math.min(72, 200 - knownHeight), random);
  const answer = knownHeight + difference;
  const visual = visualBase("height-difference", random);
  const partnerActor = pickActor(random, visual.actor);
  visual.partnerActor = partnerActor;
  visual.partnerSprite = pick(ACTOR_SPRITES[partnerActor], random);
  const actorName = ACTOR_LABELS[visual.actor];
  const partnerName = ACTOR_LABELS[partnerActor];
  return {
    id: `height-difference-${knownHeight}-${difference}-${visual.actor}-${partnerActor}`,
    kind: "height-difference",
    complexity: "观察加减",
    title: "谁比谁高？",
    story: `${partnerName}高 ${knownHeight} 厘米，${actorName}比${partnerName}高 ${difference} 厘米。`,
    question: `${actorName}高多少厘米？`,
    unknownName: `${actorName}的身高`,
    unit: "厘米",
    answer,
    equations: [`x - ${knownHeight} = ${difference}`],
    solutionSteps: [
      { formula: `x = ${knownHeight} + ${difference}`, explanation: "较矮角色的高度加上相差的部分。" },
      { formula: `x = ${answer}`, explanation: "把两段高度合起来。" },
    ],
    answerSentence: `${actorName}的身高是 ${answer} 厘米。`,
    givens: [
      { label: `${partnerName}的高度`, value: knownHeight, unit: "厘米" },
      { label: "两者相差", value: difference, unit: "厘米" },
    ],
    numbers: { answer, knownHeight, difference },
    visual,
  };
}

function repeatedLengthPuzzle(random: () => number, factor: 2 | 3): CatMousePuzzle {
  const maximumUnknown = factor === 2 ? 74 : 52;
  const answer = randomInteger(8, maximumUnknown, random);
  const extra = randomInteger(4, Math.min(44, 200 - factor * answer), random);
  const total = factor * answer + extra;
  const kind = factor === 2 ? "double-plus" : "triple-plus";
  const visual = visualBase(kind, random, "tom");
  visual.factor = factor;
  visual.referenceSprite = "measure-plank-long";
  visual.accentSprite = "measure-plank-short";
  return {
    id: `${kind}-${answer}-${extra}-${total}-${visual.backgroundId}`,
    kind,
    complexity: "乘除思考",
    title: `${factor} 块相同木板拼成长桥`,
    story: `${factor} 块同样长的木板，再接上一块 ${extra} 厘米的短板，拼成了一座 ${total} 厘米长的小桥。`,
    question: "每块长木板长多少厘米？",
    unknownName: "每块长木板的长度",
    unit: "厘米",
    answer,
    equations: [`${factor} × x + ${extra} = ${total}`],
    solutionSteps: [
      { formula: `${total} - ${extra} = ${factor * answer}`, explanation: "先拿掉已知的短板，留下相同长板的总长度。" },
      { formula: `${factor * answer} ÷ ${factor} = ${answer}`, explanation: `把剩下的长度平均分成 ${factor} 份。` },
    ],
    answerSentence: `每块长木板长 ${answer} 厘米。`,
    givens: [
      { label: "短板长度", value: extra, unit: "厘米" },
      { label: "整座小桥长度", value: total, unit: "厘米" },
    ],
    numbers: { answer, factor, extra, total },
    divisor: factor,
    visual,
  };
}

function sharingPuzzle(random: () => number, divisor: 2 | 3): CatMousePuzzle {
  const answer = randomInteger(4, divisor === 2 ? 88 : 60, random);
  const total = answer * divisor;
  const kind = divisor === 2 ? "share-two" : "share-three";
  const visual = visualBase(kind, random, "jerry");
  visual.factor = divisor;
  visual.referenceSprite = "prop-water-bucket";
  visual.accentSprite = "prop-cheese-wedge";
  return {
    id: `${kind}-${answer}-${total}-${visual.backgroundId}`,
    kind,
    complexity: "乘除思考",
    title: `奶酪平均装进 ${divisor} 个桶`,
    story: `杰瑞找到 ${total} 块小奶酪，把它们平均装进 ${divisor} 个相同的桶里，每个桶一样多。`,
    question: "每个桶里有多少块奶酪？",
    unknownName: "每桶奶酪数量",
    unit: "块",
    answer,
    equations: [`${divisor} × x = ${total}`],
    solutionSteps: [
      { formula: `x = ${total} ÷ ${divisor}`, explanation: `总数平均分成 ${divisor} 份。` },
      { formula: `x = ${answer}`, explanation: "每一份就是一个桶里的数量。" },
    ],
    answerSentence: `每个桶里有 ${answer} 块奶酪。`,
    givens: [{ label: "奶酪总数", value: total, unit: "块" }],
    numbers: { answer, divisor, total },
    divisor,
    visual,
  };
}

function doubleAndSinglePuzzle(random: () => number): CatMousePuzzle {
  const answer = randomInteger(10, 64, random);
  const total = answer * 3;
  const visual = visualBase("double-and-single", random, "jerry");
  visual.factor = 2;
  visual.partnerActor = "tom";
  visual.partnerSprite = pick(ACTOR_SPRITES.tom, random);
  visual.referenceSprite = "measure-post-tall";
  return {
    id: `double-and-single-${answer}-${total}-${visual.backgroundId}`,
    kind: "double-and-single",
    complexity: "乘除思考",
    title: "一个是另一个的两倍",
    story: `汤姆的高度正好是杰瑞的 2 倍。两个人的高度合起来是 ${total} 厘米。`,
    question: "杰瑞高多少厘米？",
    unknownName: "杰瑞的身高",
    unit: "厘米",
    answer,
    equations: [`汤姆 = 2 × x`, `2 × x + x = ${total}`],
    solutionSteps: [
      { formula: `3 × x = ${total}`, explanation: "一个汤姆相当于两个杰瑞，再加一个杰瑞，一共是三份。" },
      { formula: `x = ${total} ÷ 3 = ${answer}`, explanation: "把总高度平均分成三份。" },
    ],
    answerSentence: `杰瑞的身高是 ${answer} 厘米。`,
    givens: [{ label: "汤姆与杰瑞的合计高度", value: total, unit: "厘米" }],
    numbers: { answer, total, multiplier: 2 },
    divisor: 3,
    visual,
  };
}

export function validatePuzzle(puzzle: CatMousePuzzle): boolean {
  const values = Object.values(puzzle.numbers);
  if (
    !Number.isInteger(puzzle.answer)
    || puzzle.answer <= 0
    || puzzle.answer > 200
    || values.some((value) => !Number.isInteger(value) || value < 0 || value > 200)
    || puzzle.givens.some((given) => !Number.isInteger(given.value) || given.value < 0 || given.value > 200)
    || (puzzle.divisor !== undefined && puzzle.divisor !== 2 && puzzle.divisor !== 3)
  ) {
    return false;
  }

  const number = puzzle.numbers;
  switch (puzzle.kind) {
    case "sum-difference":
      return number.objectHeight - puzzle.answer === number.difference
        && number.objectHeight + puzzle.answer === number.total;
    case "stack-add":
      return number.baseHeight + puzzle.answer === number.total;
    case "height-difference":
      return puzzle.answer - number.knownHeight === number.difference;
    case "double-plus":
    case "triple-plus":
      return number.factor * puzzle.answer + number.extra === number.total;
    case "share-two":
    case "share-three":
      return number.divisor * puzzle.answer === number.total
        && number.total % number.divisor === 0;
    case "double-and-single":
      return puzzle.answer * 3 === number.total;
  }
}

export function generateCatMousePuzzle(
  random: () => number = Math.random,
  forcedKind?: PuzzleKind,
): CatMousePuzzle {
  const kind = forcedKind ?? pick(PUZZLE_KINDS, random);
  let puzzle: CatMousePuzzle;
  switch (kind) {
    case "sum-difference":
      puzzle = sumDifferencePuzzle(random);
      break;
    case "stack-add":
      puzzle = stackAddPuzzle(random);
      break;
    case "height-difference":
      puzzle = heightDifferencePuzzle(random);
      break;
    case "double-plus":
      puzzle = repeatedLengthPuzzle(random, 2);
      break;
    case "triple-plus":
      puzzle = repeatedLengthPuzzle(random, 3);
      break;
    case "share-two":
      puzzle = sharingPuzzle(random, 2);
      break;
    case "share-three":
      puzzle = sharingPuzzle(random, 3);
      break;
    case "double-and-single":
      puzzle = doubleAndSinglePuzzle(random);
      break;
  }
  if (!validatePuzzle(puzzle)) {
    throw new Error(`生成了不符合整数约束的猫鼠题目：${puzzle.id}`);
  }
  return puzzle;
}

export function puzzleSignature(puzzle: CatMousePuzzle) {
  return [
    puzzle.kind,
    ...Object.values(puzzle.numbers),
    puzzle.visual.backgroundId,
    puzzle.visual.layoutVariant,
    puzzle.visual.actorSprite,
  ].join("|");
}
