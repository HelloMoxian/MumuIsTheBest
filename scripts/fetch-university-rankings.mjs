#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const YEAR = 2025;
const SOURCE_ORIGIN = "https://www.shanghairanking.cn";
const BOOTSTRAP_SUBJECT = "AS0229";
const OUTPUT_DATA = path.join(
  ROOT,
  "apps/web/public/data/university-rankings-2025.json",
);

const REGION_TO_ISO2 = {
  阿尔及利亚: "dz",
  阿联酋: "ae",
  埃及: "eg",
  埃塞俄比亚: "et",
  爱尔兰: "ie",
  爱沙尼亚: "ee",
  奥地利: "at",
  澳大利亚: "au",
  巴基斯坦: "pk",
  巴西: "br",
  保加利亚: "bg",
  比利时: "be",
  冰岛: "is",
  波兰: "pl",
  丹麦: "dk",
  德国: "de",
  俄罗斯: "ru",
  法国: "fr",
  菲律宾: "ph",
  芬兰: "fi",
  哥伦比亚: "co",
  韩国: "kr",
  荷兰: "nl",
  加拿大: "ca",
  捷克: "cz",
  卡塔尔: "qa",
  克罗地亚: "hr",
  科威特: "kw",
  黎巴嫩: "lb",
  立陶宛: "lt",
  卢森堡: "lu",
  罗马尼亚: "ro",
  马来西亚: "my",
  美国: "us",
  墨西哥: "mx",
  摩洛哥: "ma",
  南非: "za",
  挪威: "no",
  葡萄牙: "pt",
  日本: "jp",
  瑞典: "se",
  瑞士: "ch",
  塞尔维亚: "rs",
  沙特阿拉伯: "sa",
  斯洛伐克: "sk",
  斯洛文尼亚: "si",
  泰国: "th",
  土耳其: "tr",
  突尼斯: "tn",
  乌克兰: "ua",
  西班牙: "es",
  希腊: "gr",
  新加坡: "sg",
  新西兰: "nz",
  匈牙利: "hu",
  伊朗: "ir",
  以色列: "il",
  意大利: "it",
  印度: "in",
  印度尼西亚: "id",
  英国: "gb",
  约旦: "jo",
  越南: "vn",
  智利: "cl",
  中国: "cn",
  中国澳门: "mo",
  中国台湾: "tw",
  中国香港: "hk",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "Mozilla/5.0 MumuLearningIsland/1.0",
          ...options.headers,
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 350));
      }
    }
  }
  throw new Error(`Unable to fetch ${url}: ${lastError?.message ?? lastError}`);
}

function parseNuxtPayload(source, sourceUrl) {
  let payload;
  const context = vm.createContext({
    __NUXT_JSONP__: (_route, value) => {
      payload = value;
    },
  });
  vm.runInContext(source, context, {
    filename: sourceUrl,
    timeout: 5_000,
  });
  assert(payload?.data?.[0], `Invalid Nuxt payload from ${sourceUrl}`);
  return payload.data[0];
}

async function loadSubject(subjectCode) {
  const pageUrl = `${SOURCE_ORIGIN}/rankings/gras/${YEAR}/${subjectCode}`;
  const html = await (await fetchWithRetry(pageUrl)).text();
  const escapedCode = subjectCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const payloadMatch = html.match(
    new RegExp(`(?:href|src)=["']([^"']+/rankings/gras/${YEAR}/${escapedCode}/payload\\.js)["']`),
  );
  assert(payloadMatch, `Payload URL was not found on ${pageUrl}`);
  const payloadUrl = new URL(payloadMatch[1], SOURCE_ORIGIN).href;
  const payloadSource = await (
    await fetchWithRetry(payloadUrl, { headers: { referer: pageUrl } })
  ).text();
  return {
    pageUrl,
    data: parseNuxtPayload(payloadSource, payloadUrl),
  };
}

function rankingStart(ranking) {
  const match = String(ranking).match(/^\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function profileUrl(row) {
  const slug = row.univUp || row.univUpEn;
  return slug ? `${SOURCE_ORIGIN}/institution/${slug}` : SOURCE_ORIGIN;
}

async function main() {
  const bootstrap = await loadSubject(BOOTSTRAP_SUBJECT);
  const categories = bootstrap.data.subjectList.map((category) => ({
    code: category.code,
    name: category.nameCn,
    subjects: category.subjs.map((subject) => ({
      code: subject.code,
      name: subject.nameCn,
    })),
  }));
  const subjects = categories.flatMap((category) => category.subjects);
  assert(subjects.length === 57, `Expected 57 subjects, received ${subjects.length}`);

  process.stdout.write(`Fetching ${subjects.length} subject rankings...\n`);
  const subjectPayloads = await mapLimit(subjects, 6, async (subject) => {
    const loaded = subject.code === BOOTSTRAP_SUBJECT
      ? bootstrap
      : await loadSubject(subject.code);
    process.stdout.write(`  ${subject.code} ${subject.name}\n`);
    return [subject.code, loaded];
  });

  const universities = new Map();
  const rankingData = {};
  let indicators = [];

  for (const [subjectCode, loaded] of subjectPayloads) {
    const rows = loaded.data.univData.filter((row) => rankingStart(row.ranking) <= 100);
    assert(rows.length > 0, `${subjectCode} did not return any Top100 rows`);
    indicators = loaded.data.indList.map((indicator) => ({
      code: String(indicator.code),
      name: indicator.nameCn,
    }));
    rankingData[subjectCode] = rows.map((row) => {
      const current = {
        code: row.univCode,
        name: row.univNameCn,
        region: row.region,
        logoUrl: `${SOURCE_ORIGIN}/_uni/${row.univLogo}`,
        profileUrl: profileUrl(row),
      };
      const previous = universities.get(row.univCode);
      if (previous) {
        assert(previous.name === current.name, `University name changed for ${row.univCode}`);
        assert(previous.logoUrl === current.logoUrl, `University logo changed for ${row.univCode}`);
      } else {
        universities.set(row.univCode, current);
      }
      return {
        ranking: String(row.ranking),
        rankStart: rankingStart(row.ranking),
        universityCode: row.univCode,
        score: typeof row.score === "number" ? row.score : null,
        indicators: indicators.map((indicator) => {
          const value = row.indData?.[indicator.code];
          return typeof value === "number" ? value : null;
        }),
      };
    });
  }

  const universityList = [...universities.values()].sort((left, right) =>
    left.code.localeCompare(right.code),
  );
  const regionNames = [...new Set(universityList.map((university) => university.region))].sort(
    (left, right) => left.localeCompare(right, "zh-CN"),
  );
  const missingRegions = regionNames.filter((region) => !REGION_TO_ISO2[region]);
  assert(!missingRegions.length, `Missing flag mapping: ${missingRegions.join(", ")}`);

  await mkdir(path.dirname(OUTPUT_DATA), { recursive: true });
  const countries = regionNames.map((name) => {
    const iso2 = REGION_TO_ISO2[name];
    return {
      name,
      iso2,
      iconUrl: `https://flagcdn.com/w80/${iso2}.png`,
    };
  });
  const output = {
    schemaVersion: 1,
    year: YEAR,
    retrievedAt: new Date().toISOString(),
    source: {
      name: "软科世界一流学科排名",
      url: `${SOURCE_ORIGIN}/rankings/gras/${YEAR}/${BOOTSTRAP_SUBJECT}`,
      note: "榜单与校徽来自软科公开页面；国旗图标来自 Flagcdn。仅用于家庭学习查阅。",
    },
    indicators,
    categories,
    countries,
    universities: universityList,
    rankings: rankingData,
  };
  await writeFile(OUTPUT_DATA, `${JSON.stringify(output)}\n`, "utf8");
  process.stdout.write(
    `Saved ${subjects.length} subjects, ${universityList.length} universities, and ${regionNames.length} icon links.\n`,
  );
}

await main();
