#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const assetPath = resolve(
  process.cwd(),
  process.argv[2] ?? "content/chinese/common-characters.v1.json",
);
const expectedPools = [500, 1_000, 1_500, 2_000, 2_500];
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

const asset = JSON.parse(await readFile(assetPath, "utf8"));
check(asset.schemaVersion === 1, "schemaVersion 必须为 1");
check(Array.isArray(asset.sources) && asset.sources.length >= 4, "必须记录全部数据来源");
check(
  Array.isArray(asset.characters) && asset.characters.length === 2_500,
  "汉字资产必须恰好包含 2500 项",
);

const seenCharacters = new Set();
for (const [index, item] of asset.characters.entries()) {
  const label = `第 ${index + 1} 项`;
  check(item.rank === index + 1, `${label}的频率序号不连续`);
  check(
    typeof item.character === "string" &&
      /^\p{Script=Han}$/u.test(item.character),
    `${label}不是单个汉字`,
  );
  check(!seenCharacters.has(item.character), `${label}的汉字重复：${item.character}`);
  seenCharacters.add(item.character);
  check(
    typeof item.pinyin === "string" &&
      item.pinyin.length >= 1 &&
      !/[0-9]/u.test(item.pinyin),
    `${label}缺少规范拼音`,
  );
  check(
    Number.isInteger(item.strokes) && item.strokes >= 1 && item.strokes <= 64,
    `${label}笔画数异常`,
  );
  check(
    Number(item.standardNumber) >= 1 && Number(item.standardNumber) <= 3_500,
    `${label}不属于通用规范汉字表一级字`,
  );
  check(
    typeof item.meaning === "string" &&
      item.meaning.length >= 2 &&
      item.meaning.length <= 180 &&
      !/[\\^]|[?？]{3}|�/u.test(item.meaning),
    `${label}释义为空、过长或含损坏片段`,
  );
  check(
    Array.isArray(item.words) &&
      item.words.length >= 1 &&
      item.words.length <= 4,
    `${label}组词数量必须为 1—4 个`,
  );
  check(
    item.words.every(
      (word) =>
        /^\p{Script=Han}{2,5}$/u.test(word) &&
        word.includes(item.character),
    ),
    `${label}包含无效组词`,
  );
  check(
    new Set(item.words).size === item.words.length,
    `${label}包含重复组词`,
  );
  check(
    typeof item.sentence === "string" &&
      item.sentence.includes(item.character) &&
      item.sentence.length <= 40,
    `${label}例句未包含目标字或过长`,
  );
  check(
    Array.isArray(item.idioms) &&
      item.idioms.length <= 2 &&
      item.idioms.every(
        (idiom) =>
          /^\p{Script=Han}{4}$/u.test(idiom.word) &&
          idiom.word.includes(item.character) &&
          typeof idiom.pinyin === "string" &&
          idiom.pinyin.length >= 1 &&
          typeof idiom.meaning === "string" &&
          idiom.meaning.length >= 2 &&
          idiom.meaning.length <= 100,
      ),
    `${label}包含无效成语`,
  );
}

for (const poolSize of expectedPools) {
  const prefix = asset.characters.slice(0, poolSize);
  check(prefix.length === poolSize, `${poolSize} 字池数量不完整`);
  check(
    prefix.every((item, index) => item.rank === index + 1),
    `${poolSize} 字池不是频率顺序的连续前缀`,
  );
}

if (errors.length) {
  console.error(`常用汉字资产校验失败，共 ${errors.length} 项：`);
  for (const error of errors.slice(0, 60)) console.error(`- ${error}`);
  if (errors.length > 60) console.error(`- 其余 ${errors.length - 60} 项已省略`);
  process.exit(1);
}

const idiomCount = asset.characters.reduce(
  (total, item) => total + item.idioms.length,
  0,
);
const wordCount = asset.characters.reduce(
  (total, item) => total + item.words.length,
  0,
);
console.log(
  `常用汉字资产校验通过：${asset.characters.length} 字、${wordCount} 个组词、${idiomCount} 条成语。`,
);
