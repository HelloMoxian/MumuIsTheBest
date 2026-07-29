import assert from "node:assert/strict";
import test from "node:test";
import { nucleusParticleCounts } from "./element-knowledge";
import { ELEMENTS } from "./elements.generated";
import {
  applyNavigationCommands,
  isBackCommand,
  isDetailCommand,
  moveSelection,
  parseNavigationCommands,
} from "./logic";

test("包含原子序数 1—118 的完整元素资料", () => {
  assert.equal(ELEMENTS.length, 118);
  assert.equal(ELEMENTS[0]?.chineseName, "氢");
  assert.equal(ELEMENTS.at(-1)?.chineseName, "鿫");
  assert.deepEqual(
    ELEMENTS.map((element) => element.atomicNumber),
    Array.from({ length: 118 }, (_, index) => index + 1),
  );
  assert.ok(ELEMENTS.every((element) => (
    element.symbol
    && element.chineseName
    && element.pinyin
    && element.atomicMass
  )));
});

test("每个元素的电子层总数等于原子序数", () => {
  for (const element of ELEMENTS) {
    const electronCount = element.shells.reduce((total, count) => total + count, 0);
    assert.equal(electronCount, element.atomicNumber, element.chineseName);
  }
});

test("周期表坐标唯一，镧系和锕系各有 15 个元素", () => {
  const coordinates = ELEMENTS.map(
    (element) => `${element.displayRow}:${element.displayColumn}`,
  );
  assert.equal(new Set(coordinates).size, 118);
  assert.equal(ELEMENTS.filter((element) => element.category === "lanthanide").length, 15);
  assert.equal(ELEMENTS.filter((element) => element.category === "actinide").length, 15);
  assert.ok(
    ELEMENTS.filter((element) => element.category === "lanthanide")
      .every((element) => element.displayRow === 8),
  );
  assert.ok(
    ELEMENTS.filter((element) => element.category === "actinide")
      .every((element) => element.displayRow === 9),
  );
});

test("连续语音方向词逐个解析并依次移动", () => {
  assert.deepEqual(
    parseNavigationCommands("上上下下、左左右右"),
    ["up", "up", "down", "down", "left", "left", "right", "right"],
  );
  assert.equal(applyNavigationCommands(1, ["down", "right"]), 4);
});

test("横向跳过周期表空格，纵向寻找目标方向最近元素", () => {
  assert.equal(moveSelection(1, "right"), 2);
  assert.equal(moveSelection(2, "left"), 1);
  assert.equal(moveSelection(5, "up"), 2);
  assert.equal(moveSelection(57, "right"), 58);
  assert.equal(moveSelection(71, "right"), 71);
});

test("到达边缘后方向命令保持原元素", () => {
  assert.equal(moveSelection(1, "up"), 1);
  assert.equal(moveSelection(1, "left"), 1);
  assert.equal(moveSelection(118, "right"), 118);
  assert.equal(moveSelection(103, "down"), 103);
});

test("识别详细信息与返回的自然语音表达", () => {
  assert.equal(isDetailCommand("请打开详细信息"), true);
  assert.equal(isDetailCommand("看看元素详情"), true);
  assert.equal(isBackCommand("返回"), true);
  assert.equal(isBackCommand("关掉详情"), true);
  assert.equal(isBackCommand("向右"), false);
});

test("前十个元素精确展示核子数量，较重元素使用紧密示意核团", () => {
  const hydrogen = nucleusParticleCounts(ELEMENTS[0]!);
  const helium = nucleusParticleCounts(ELEMENTS[1]!);
  const neon = nucleusParticleCounts(ELEMENTS[9]!);
  const sodium = nucleusParticleCounts(ELEMENTS[10]!);

  assert.deepEqual(hydrogen, { exactDisplay: true, protons: 1, neutrons: 0 });
  assert.deepEqual(helium, { exactDisplay: true, protons: 2, neutrons: 2 });
  assert.deepEqual(neon, { exactDisplay: true, protons: 10, neutrons: 10 });
  assert.equal(sodium.exactDisplay, false);
  assert.equal(sodium.protons + sodium.neutrons, 42);
});
