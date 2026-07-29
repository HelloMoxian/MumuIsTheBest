#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const CHARACTER_LIMIT = 2_500;
const MAX_WORDS = 4;
const MAX_IDIOMS = 2;
const CIRCLED_NUMBERS = "⒈⒉⒊⒋⒌⒍⒎⒏⒐⒑";
const UNSUITABLE_PHRASES =
  /他妈|妈的|强奸|性交|色情|妓女|阴茎|乳房|毒品|吸毒|自杀|屠杀|枪杀|赌博|酷刑|虐待|尸体|凶杀/;
const HAN_WORD = /^\p{Script=Han}{2,4}$/u;
const FOUR_HAN = /^\p{Script=Han}{4}$/u;
const MANUAL_MEANINGS = new Map([
  ["的", "常放在词语后面，表示修饰、所属或指代关系。"],
  ["不", "表示否定，意思是没有、不是或不要。"],
  ["大", "表示体积、数量、力量或范围超过一般。"],
  ["重", "分量大；也读 chóng，表示重复、重新。"],
  ["各", "表示每一个或每一类。"],
  ["打", "用手或工具碰击；也可以表示进行某种动作。"],
  ["北", "方向名，早晨面对太阳时左手的一边，跟南相对。"],
  ["传", "把消息、知识或东西送给别人；也读 zhuàn。"],
  ["单", "不复杂，只有一个；也可以指清单、单据。"],
  ["考", "检查知识或能力，也有思考、研究的意思。"],
  ["参", "加入、参与或查看；还有其他读音。"],
  ["陈", "摆放、叙说；也可以表示时间久、旧。"],
  ["朝", "面对、向着；也可以指早晨或一个朝代。"],
  ["陆", "高出水面的土地。"],
  ["冲", "快速向前；也可以表示用水浇洗或相互碰撞。"],
  ["丽", "好看、美好。"],
  ["巨", "非常大。"],
  ["奥", "深、不容易懂；也常见于奥秘、奥运会。"],
  ["骨", "人和脊椎动物身体里坚硬的支架。"],
  ["懂", "明白、了解。"],
  ["召", "叫人来，也表示召集。"],
  ["侧", "旁边，跟正面相对。"],
  ["玛", "常用于音译词和人名，也见于玛瑙。"],
  ["症", "疾病表现出来的情况。"],
  ["虫", "昆虫等小动物的通称。"],
  ["稍", "数量不多或程度不深，表示稍微。"],
  ["汗", "人体皮肤排出的液体。"],
  ["仇", "因为受到伤害而产生的怨恨；也读 qiú，用于姓氏。"],
  ["娜", "常用于人名，形容姿态柔美。"],
  ["匆", "急急忙忙。"],
  ["脏", "不干净；也读 zàng，表示身体内部的器官。"],
  ["猫", "一种常见的哺乳动物，善于捉老鼠。"],
  ["蛇", "身体细长、没有四肢的爬行动物。"],
  ["戈", "古代一种带横刃的长柄兵器。"],
  ["菌", "细菌、真菌等微小生物的统称。"],
  ["扁", "物体宽而薄；也读 piān，用于扁舟。"],
  ["纹", "物体表面的线条或图案。"],
  ["璃", "常和玻组成玻璃这个词。"],
  ["哦", "叹词，表示明白、惊讶或回应。"],
  ["哩", "语气助词，也用于某些长度单位的音译。"],
  ["愉", "高兴、快乐。"],
  ["朴", "不华丽、实在；也读 pō、pò、piáo。"],
  ["葡", "常和萄组成葡萄这个词。"],
  ["鹅", "一种家禽，颈长，脚有蹼，善于游水。"],
  ["萄", "常和葡组成葡萄这个词。"],
  ["湘", "湖南的别称，也指湘江。"],
  ["厦", "高大的房屋；也读 xià，用于厦门。"],
  ["硕", "大；也常见于硕果、硕士。"],
  ["咖", "常用于咖啡、咖喱等音译词。"],
  ["巷", "较窄的街道或小路。"],
  ["糕", "用米粉、面粉等做成的食品。"],
  ["哇", "叹词，表示惊讶、赞叹或哭声。"],
  ["屡", "一次又一次。"],
  ["匙", "舀取液体或粉末的小工具；在钥匙中读轻声 shi。"],
  ["苹", "常和果组成苹果这个词，也是一种水生植物。"],
  ["钥", "开锁或上锁的工具；也读 yuè。"],
  ["胳", "常和膊组成胳膊这个词。"],
  ["国", "国家；也可以表示本国的、国家的。"],
  ["实", "里面充满，没有空隙；也可以表示真实、实际。"],
  ["顶", "人体或物体最高的部分；也表示从下面支撑。"],
  ["氏", "姓的别称，也用于某些称呼，比如摄氏度。"],
  ["泡", "液体里鼓起的圆形气泡；也指把东西放在液体里浸。"],
  ["嫩", "初生而柔软，跟老相对；也可以表示颜色浅、食物软。"],
  ["于", "常用介词，可以表示在、到、从、给、向、对等意思。"],
  ["品", "物品；也表示种类、等级、性质或品尝。"],
  ["列", "排成的行；也表示排列、列出。"],
  ["彭", "常用于姓氏，也见于彭湃这个词。"],
]);

function argument(name) {
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

const frequencyPath = argument("--frequency");
const wordFrequencyPath = argument("--word-frequency");
const hskPath = argument("--hsk");
const dictionaryDirectory = argument("--dictionary");
const outputPath =
  argument("--output") ??
  resolve(process.cwd(), "content/chinese/common-characters.v1.json");

if (!frequencyPath || !wordFrequencyPath || !hskPath || !dictionaryDirectory) {
  console.error(
    "用法：node scripts/generate-common-characters.mjs " +
      "--frequency /path/to/hanzi_db.csv " +
      "--word-frequency /path/to/SUBTLEX-CH-WF " +
      "--hsk /path/to/hsk30-expanded.csv " +
      "--dictionary /path/to/chinese-xinhua/data " +
      "[--output content/chinese/common-characters.v1.json]",
  );
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...values] = rows;
  return values
    .filter((value) => value.length === headers.length)
    .map((value) =>
      Object.fromEntries(headers.map((header, index) => [header, value[index]])),
    );
}

function normalizedPinyin(value) {
  return String(value ?? "")
    .trim()
    .replaceAll("ɡ", "g")
    .replace(/\s+/g, " ");
}

function cleanText(value, character, maximum) {
  return String(value ?? "")
    .replaceAll("﹑", "、")
    .replace(/[“”"']/g, "")
    .replaceAll(",", "，")
    .replace(/\s+/g, "")
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d.、]+/, "")
    .replace(/--.*$/u, "")
    .replace(/[；;]$/u, "。")
    .slice(0, maximum)
    .replace(/[，、：:]$/u, "。");
}

function cleanMeaningSense(value, character) {
  const source = String(value ?? "");
  const beforeExample = source.includes("～") ? source.split("～", 1)[0] : source;
  const cleaned = cleanText(beforeExample, character, 92);
  if (cleaned.length === 2) return `指${cleaned}`;
  return cleaned;
}

function numberedSenses(explanation, character) {
  const normalized = String(explanation ?? "").replace(/\r/g, "");
  const start = normalized.indexOf("⒈");
  if (start < 0) return [];
  const section = normalized.slice(start);
  const senses = [];
  for (let index = 0; index < 3; index += 1) {
    const marker = CIRCLED_NUMBERS[index];
    const nextMarker = CIRCLED_NUMBERS[index + 1];
    const markerPosition = section.indexOf(marker);
    if (markerPosition < 0) continue;
    const nextPosition = nextMarker ? section.indexOf(nextMarker, markerPosition + 1) : -1;
    const text = cleanMeaningSense(
      section.slice(markerPosition + 1, nextPosition < 0 ? undefined : nextPosition),
      character,
    );
    if (text.length >= 2 && !/^[①②③④⑤⑥⑦⑧⑨⑩⒈-⒑]+$/u.test(text)) {
      senses.push(text);
    }
  }
  return senses;
}

function parenthesizedSenses(value, character) {
  const normalized = String(value ?? "").replace(/\r/g, "");
  const sectionStart = normalized.lastIndexOf(`\n${character}\n`);
  const section = sectionStart >= 0 ? normalized.slice(sectionStart) : normalized;
  const senses = [];
  for (let index = 1; index <= 3; index += 1) {
    const marker = new RegExp(`(?:^|\\n)\\s*[（(]${index}[）)]\\s*\\n?`, "u");
    const nextMarker = new RegExp(`(?:^|\\n)\\s*[（(]${index + 1}[）)]\\s*\\n?`, "u");
    const match = marker.exec(section);
    if (!match) continue;
    const remaining = section.slice((match.index ?? 0) + match[0].length);
    const next = nextMarker.exec(remaining);
    const text = cleanMeaningSense(
      remaining.slice(0, next?.index ?? undefined),
      character,
    );
    if (text.length >= 2) senses.push(text);
  }
  return senses;
}

function circledSenses(value, character) {
  const normalized = String(value ?? "").replace(/\r/g, "");
  const start = normalized.search(/(?:^|\n)\s*①/u);
  if (start < 0) return [];
  const section = normalized.slice(start);
  const markers = "①②③";
  const senses = [];
  for (let index = 0; index < markers.length; index += 1) {
    const position = section.indexOf(markers[index]);
    if (position < 0) continue;
    const next = section.indexOf(markers[index + 1], position + 1);
    const text = cleanMeaningSense(
      section.slice(position + 1, next < 0 ? undefined : next),
      character,
    );
    if (text.length >= 2) senses.push(text);
  }
  return senses;
}

function paragraphSenses(explanation, character) {
  return String(explanation ?? "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((value) => cleanText(value, character, 90))
    .filter(
      (value) =>
        value.length >= 4 &&
        value.length <= 90 &&
        !value.startsWith(character) &&
        !value.includes("《") &&
        !value.includes("--") &&
        !/^[（(]|本义|同本义|又如|形声|会意|象形/u.test(value),
    )
    .slice(0, 2);
}

function briefMeaning(entry, fallbackDefinition, character) {
  const manual = MANUAL_MEANINGS.get(character);
  if (manual) return manual;
  const senses = numberedSenses(entry?.explanation, character);
  const circled = circledSenses(entry?.explanation, character);
  const standardized = parenthesizedSenses(entry?.more, character);
  const paragraphs = paragraphSenses(entry?.explanation, character);
  const selected = (
    senses.length
      ? senses
      : circled.length
        ? circled
        : standardized.length
          ? standardized
          : paragraphs
  )
    .filter((sense) => !/[a-zA-Z\\^]|[?？]{3}/u.test(sense))
    .slice(0, 2);
  if (selected.length) {
    return selected
      .map((sense) => (/[。！？]$/u.test(sense) ? sense : `${sense}。`))
      .join("")
      .slice(0, 168);
  }
  const fallback = cleanText(fallbackDefinition, character, 92);
  return fallback && !/[a-zA-Z]/u.test(fallback)
    ? `常用含义：${fallback}。`
    : "";
}

function wordScore(word, rankByCharacter, target) {
  const ranks = [...word].map(
    (character) => rankByCharacter.get(character) ?? 20_000,
  );
  const uncommonPenalty = ranks.reduce(
    (total, rank) => total + Math.min(rank, 8_000),
    0,
  );
  const lengthPenalty = Math.abs(word.length - 2) * 4_000;
  const targetPositionPenalty = word.indexOf(target) * 300;
  return uncommonPenalty + lengthPenalty + targetPositionPenalty;
}

function wordFrequencyScore(word, wordFrequency) {
  const count = wordFrequency.get(word) ?? 0;
  return count > 0 ? -Math.log10(count + 1) * 1_000_000 : 0;
}

function hskScore(word, hskPriority) {
  const priority = hskPriority.get(word);
  return priority ? -10_000_000_000 + priority : 0;
}

function idiomScore(idiom, rankByCharacter) {
  return [...idiom].reduce(
    (total, character) =>
      total + Math.min(rankByCharacter.get(character) ?? 15_000, 15_000),
    0,
  );
}

function childSafe(value) {
  return !UNSUITABLE_PHRASES.test(String(value ?? ""));
}

function selectedWords(
  candidates,
  character,
  rankByCharacter,
  wordFrequency,
  hskPriority,
) {
  return [...new Set(candidates)]
    .filter((word) => HAN_WORD.test(word) && word.includes(character))
    .filter(childSafe)
    .sort(
      (left, right) =>
        hskScore(left, hskPriority) -
          hskScore(right, hskPriority) ||
        wordFrequencyScore(left, wordFrequency) -
          wordFrequencyScore(right, wordFrequency) ||
        wordScore(left, rankByCharacter, character) -
          wordScore(right, rankByCharacter, character) ||
        left.localeCompare(right, "zh-CN"),
    )
    .slice(0, MAX_WORDS);
}

function sentenceFor(word, rank) {
  const templates = [
    `木木认真地读出了「${word}」这个词。`,
    `今天我们一起认识「${word}」这个词。`,
    `我在故事里读到了「${word}」。`,
    `「${word}」是今天新认识的词语。`,
  ];
  return templates[(rank - 1) % templates.length];
}

const [
  frequencyText,
  wordFrequencyBuffer,
  hskText,
  dictionaryText,
  phraseText,
  idiomText,
] =
  await Promise.all([
    readFile(frequencyPath, "utf8"),
    readFile(wordFrequencyPath),
    readFile(hskPath, "utf8"),
    readFile(resolve(dictionaryDirectory, "word.json"), "utf8"),
    readFile(resolve(dictionaryDirectory, "ci.json"), "utf8"),
    readFile(resolve(dictionaryDirectory, "idiom.json"), "utf8"),
  ]);

const wordFrequencyText = new TextDecoder("gb18030").decode(wordFrequencyBuffer);
const wordFrequency = new Map();
for (const line of wordFrequencyText.split(/\r?\n/).slice(3)) {
  const [word, count] = line.split("\t");
  if (word && Number.isFinite(Number(count))) {
    wordFrequency.set(word, Number(count));
  }
}

const hskPriority = new Map();
const hskTerms = [];
for (const row of parseCsv(hskText)) {
  const word = String(row.Simplified ?? "").trim();
  if (!HAN_WORD.test(word) || !childSafe(word)) continue;
  const level = row.Level === "7-9" ? 7 : Number(row.Level);
  const webNumber = Number(row.WebNo);
  const priority =
    (Number.isFinite(level) ? level : 9) * 1_000_000 +
    (Number.isFinite(webNumber) ? webNumber : 999_999);
  hskPriority.set(
    word,
    Math.min(hskPriority.get(word) ?? Number.POSITIVE_INFINITY, priority),
  );
  hskTerms.push(word);
}

const frequencyRows = parseCsv(frequencyText);
const rankedRows = frequencyRows
  .map((row) => ({
    sourceRank: Number(row.frequency_rank),
    character: row.character,
    pinyin: normalizedPinyin(row.pinyin),
    definition: row.definition,
    radical: row.radical,
    strokes: Number(row.stroke_count),
    standardNumber: row.general_standard_num,
  }))
  .filter(
    (row) =>
      Number.isInteger(row.sourceRank) &&
      row.sourceRank >= 1 &&
      row.character?.length === 1 &&
      Number(row.standardNumber) >= 1 &&
      Number(row.standardNumber) <= 3_500,
  )
  .sort((left, right) => left.sourceRank - right.sourceRank)
  .map((row, index) => ({ ...row, rank: index + 1 }));

const firstCharacters = rankedRows.slice(0, CHARACTER_LIMIT);
const selectedCharacterSet = new Set(
  firstCharacters.map((row) => row.character),
);
const rankByCharacter = new Map(
  rankedRows.map((row) => [row.character, row.sourceRank]),
);
const dictionaryByCharacter = new Map(
  JSON.parse(dictionaryText).map((entry) => [entry.word, entry]),
);

const phraseCandidates = new Map(
  firstCharacters.map((row) => [row.character, []]),
);
for (const phrase of hskTerms) {
  for (const character of new Set(phrase)) {
    if (selectedCharacterSet.has(character)) {
      phraseCandidates.get(character).push(phrase);
    }
  }
}
for (const entry of JSON.parse(phraseText)) {
  const phrase = String(entry.ci ?? "").trim();
  if (!HAN_WORD.test(phrase) || !childSafe(phrase)) continue;
  for (const character of new Set(phrase)) {
    if (selectedCharacterSet.has(character)) {
      phraseCandidates.get(character).push(phrase);
    }
  }
}

const idiomCandidates = new Map(
  firstCharacters.map((row) => [row.character, []]),
);
for (const entry of JSON.parse(idiomText)) {
  const idiom = String(entry.word ?? "").trim();
  if (
    !FOUR_HAN.test(idiom) ||
    !childSafe(idiom) ||
    !childSafe(entry.explanation)
  ) {
    continue;
  }
  for (const character of new Set(idiom)) {
    if (selectedCharacterSet.has(character)) {
      idiomCandidates.get(character).push({
        word: idiom,
        pinyin: normalizedPinyin(entry.pinyin),
        meaning: cleanText(entry.explanation, character, 96),
      });
    }
  }
}

const characters = firstCharacters.map((row) => {
  const dictionaryEntry = dictionaryByCharacter.get(row.character);
  const dictionaryPinyin = normalizedPinyin(dictionaryEntry?.pinyin);
  let words = selectedWords(
    phraseCandidates.get(row.character),
    row.character,
    rankByCharacter,
    wordFrequency,
    hskPriority,
  );
  if (!words.length) {
    words = [row.character.repeat(2)];
  }
  const idioms = idiomCandidates
    .get(row.character)
    .sort(
      (left, right) =>
        wordFrequencyScore(left.word, wordFrequency) -
          wordFrequencyScore(right.word, wordFrequency) ||
        idiomScore(left.word, rankByCharacter) -
          idiomScore(right.word, rankByCharacter) ||
        left.word.localeCompare(right.word, "zh-CN"),
    )
    .filter(
      (entry, index, values) =>
        values.findIndex((candidate) => candidate.word === entry.word) ===
        index,
    )
    .slice(0, MAX_IDIOMS);

  return {
    rank: row.rank,
    character: row.character,
    pinyin:
      dictionaryPinyin && !/[0-9]/u.test(dictionaryPinyin)
        ? dictionaryPinyin
        : row.pinyin,
    radical: dictionaryEntry?.radicals || row.radical || "",
    strokes: Number(dictionaryEntry?.strokes) || row.strokes || 0,
    standardNumber: row.standardNumber || null,
    meaning:
      briefMeaning(dictionaryEntry, row.definition, row.character) ||
      `这个字常见于「${words.slice(0, 3).join("、")}」等词语中。`,
    words,
    sentence: sentenceFor(words[0], row.rank),
    idioms,
  };
});

const output = {
  schemaVersion: 1,
  generatedAt: "2026-07-29T00:00:00.000Z",
  ordering:
    "按 Jun Da 现代汉字语料频率排名筛选通用规范汉字表一级字；500/1000/1500/2000/2500 均为此前缀池。",
  sources: [
    {
      name: "hanziDB.csv",
      url: "https://github.com/ruddfawcett/hanziDB.csv",
      purpose: "简体汉字频率顺序、基础拼音、部首、笔画与通用规范汉字编号交叉字段",
      license: "MIT",
    },
    {
      name: "HSK 3.0 vocabulary",
      url: "https://github.com/ivankra/hsk30",
      purpose: "优先选择经过清理和交叉校验的分级常用学习词语",
      license: "MIT",
    },
    {
      name: "SUBTLEX-CH",
      url: "https://doi.org/10.1371/journal.pone.0010729.s002",
      purpose: "以影视字幕口语语料的词频重新排序组词与成语候选",
      license: "PLOS ONE supplementary dataset",
    },
    {
      name: "chinese-xinhua",
      url: "https://github.com/pwxcoo/chinese-xinhua",
      purpose: "拼音、部首、笔画、中文释义、词语与成语候选",
      license: "MIT",
    },
  ],
  characters,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`已生成 ${characters.length} 个汉字：${outputPath}`);
