import assert from "node:assert/strict";
import test from "node:test";
import {
  filterRankingRows,
  parseUniversityRankingData,
  regionsForSubject,
  type UniversityRankingData,
} from "./logic";

const fixture: UniversityRankingData = {
  schemaVersion: 1,
  year: 2025,
  retrievedAt: "2026-08-27T00:00:00.000Z",
  source: { name: "测试榜单", url: "https://example.com", note: "fixture" },
  indicators: [{ code: "41", name: "指标一" }],
  categories: [{
    code: "AS01",
    name: "理学",
    subjects: [{ code: "AS0101", name: "数学" }],
  }],
  countries: [
    { name: "中国", iso2: "cn", iconUrl: "https://example.com/cn.png" },
    { name: "新加坡", iso2: "sg", iconUrl: "https://example.com/sg.png" },
  ],
  universities: [
    { code: "U1", name: "清华大学", region: "中国", logoUrl: "https://example.com/u1.png", profileUrl: "https://example.com/u1" },
    { code: "U2", name: "南洋理工大学", region: "新加坡", logoUrl: "https://example.com/u2.png", profileUrl: "https://example.com/u2" },
  ],
  rankings: {
    AS0101: [
      { ranking: "1", rankStart: 1, universityCode: "U2", score: 100, indicators: [50] },
      { ranking: "2", rankStart: 2, universityCode: "U1", score: 98, indicators: [48] },
    ],
  },
};

test("parseUniversityRankingData accepts the supported schema", () => {
  assert.equal(parseUniversityRankingData(fixture).year, 2025);
});

test("parseUniversityRankingData rejects incompatible and empty input", () => {
  assert.throws(() => parseUniversityRankingData(null), /版本不兼容/);
  assert.throws(
    () => parseUniversityRankingData({ ...fixture, categories: [] }),
    /没有专业分类/,
  );
});

test("filterRankingRows keeps source order while filtering by name and country", () => {
  assert.deepEqual(
    filterRankingRows(fixture, "AS0101", "大学", "全部").map((row) => row.university.code),
    ["U2", "U1"],
  );
  assert.deepEqual(
    filterRankingRows(fixture, "AS0101", "清华", "中国").map((row) => row.university.code),
    ["U1"],
  );
  assert.deepEqual(filterRankingRows(fixture, "AS0101", "不存在", "全部"), []);
});

test("regionsForSubject returns unique sorted regions", () => {
  assert.deepEqual(regionsForSubject(fixture, "AS0101"), ["新加坡", "中国"]);
});
