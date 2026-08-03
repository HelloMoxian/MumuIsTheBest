import assert from "node:assert/strict";
import test from "node:test";
import {
  MISSION_GAME_BY_ROUTE,
  MISSION_GAME_DEFINITIONS,
} from "./curricula";
import {
  detectMissionGameCommand,
  isMissionAnswer,
  parseVoiceChoice,
  selectMissions,
  summarizeMissionResults,
  validateMissionGameDefinition,
} from "./logic";

test("实验大师包含十个结构完整且答案合法的任务", () => {
  assert.equal(MISSION_GAME_DEFINITIONS.length, 1);
  const definition = MISSION_GAME_DEFINITIONS[0]!;
  assert.equal(definition.id, "experiment-master");
  assert.equal(definition.missions.length, 10);
  assert.deepEqual(validateMissionGameDefinition(definition), []);
  assert.equal(MISSION_GAME_BY_ROUTE.get(definition.route), definition);
});

test("五题和十题抽取不会重复", () => {
  const definition = MISSION_GAME_DEFINITIONS[0]!;
  const five = selectMissions(definition, 5, () => 0.37);
  const ten = selectMissions(definition, 10, () => 0.61);
  assert.equal(five.length, 5);
  assert.equal(ten.length, 10);
  assert.equal(new Set(five.map((mission) => mission.id)).size, 5);
  assert.equal(new Set(ten.map((mission) => mission.id)).size, 10);
});

test("单选和排序答案使用不同且严格的判定", () => {
  const definition = MISSION_GAME_DEFINITIONS[0]!;
  const single = definition.missions.find((mission) => mission.id === "salt-dissolves")!;
  const order = definition.missions.find((mission) => mission.id === "water-treatment-order")!;
  assert.equal(isMissionAnswer(single, "clear"), true);
  assert.equal(isMissionAnswer(single, "bottom"), false);
  assert.equal(isMissionAnswer(order, ["settle", "filter", "disinfect"]), true);
  assert.equal(isMissionAnswer(order, ["filter", "settle", "disinfect"]), false);
});

test("语音可以按序号或候选项文字选择", () => {
  const mission = MISSION_GAME_DEFINITIONS[0]!.missions
    .find((item) => item.id === "salt-dissolves")!;
  assert.equal(parseVoiceChoice("我选第二个", mission.choices), "bottom");
  assert.equal(parseVoiceChoice("水仍然透明", mission.choices), "clear");
  assert.equal(parseVoiceChoice("我还在想", mission.choices), null);
});

test("语音局控制覆盖开始、下一题、朗读、结束和继续识别", () => {
  assert.equal(detectMissionGameCommand("开始一局"), "start");
  assert.equal(detectMissionGameCommand("再来一局"), "start");
  assert.equal(detectMissionGameCommand("下一个发现"), "next");
  assert.equal(detectMissionGameCommand("再听一遍"), "repeat");
  assert.equal(detectMissionGameCommand("检查顺序"), "check");
  assert.equal(detectMissionGameCommand("结束任务"), "end");
  assert.equal(detectMissionGameCommand("继续识别语音"), "continue-voice");
});

test("结算区分第一次发现、观察后发现和中途结束", () => {
  assert.deepEqual(
    summarizeMissionResults([
      { missionId: "a", conclusion: "A", discoveredFirstTry: true },
      { missionId: "b", conclusion: "B", discoveredFirstTry: false },
    ], 5),
    {
      completed: 2,
      expected: 5,
      firstTry: 1,
      observed: 1,
      completeRound: false,
    },
  );
});
