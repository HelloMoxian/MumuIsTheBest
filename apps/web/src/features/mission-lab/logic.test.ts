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

test("十二个玩法都包含十个结构完整且答案合法的任务", () => {
  assert.equal(MISSION_GAME_DEFINITIONS.length, 12);
  assert.equal(
    MISSION_GAME_DEFINITIONS.reduce(
      (total, definition) => total + definition.missions.length,
      0,
    ),
    120,
  );
  assert.equal(
    new Set(MISSION_GAME_DEFINITIONS.map((definition) => definition.id)).size,
    MISSION_GAME_DEFINITIONS.length,
  );
  assert.equal(
    new Set(MISSION_GAME_DEFINITIONS.map((definition) => definition.route)).size,
    MISSION_GAME_DEFINITIONS.length,
  );
  for (const definition of MISSION_GAME_DEFINITIONS) {
    assert.deepEqual(
      validateMissionGameDefinition(definition),
      [],
      `${definition.id} 课程结构不完整`,
    );
    assert.equal(MISSION_GAME_BY_ROUTE.get(definition.route), definition);
  }
});

test("五题和十题抽取不会重复", () => {
  for (const definition of MISSION_GAME_DEFINITIONS) {
    const five = selectMissions(definition, 5, () => 0.37);
    const ten = selectMissions(definition, 10, () => 0.61);
    assert.equal(five.length, 5);
    assert.equal(ten.length, 10);
    assert.equal(new Set(five.map((mission) => mission.id)).size, 5);
    assert.equal(new Set(ten.map((mission) => mission.id)).size, 10);
  }
});

test("单选和排序答案使用不同且严格的判定", () => {
  const numberWar = MISSION_GAME_BY_ROUTE.get("/game/number-war")!;
  const single = numberWar.missions.find((mission) => mission.id === "make-ten")!;
  const order = numberWar.missions.find((mission) => mission.id === "order-four")!;
  assert.equal(isMissionAnswer(single, "4"), true);
  assert.equal(isMissionAnswer(single, "3"), false);
  assert.equal(isMissionAnswer(order, ["9", "19", "29", "90"]), true);
  assert.equal(isMissionAnswer(order, ["90", "29", "19", "9"]), false);
  assert.equal(isMissionAnswer(order, ["9", "19", "29"]), false);
});

test("语音可以按序号或候选项文字选择", () => {
  const mission = MISSION_GAME_BY_ROUTE
    .get("/physics/unit-magic")!
    .missions.find((item) => item.id === "pencil-cm")!;
  assert.equal(parseVoiceChoice("我选第二个", mission.choices), "m");
  assert.equal(parseVoiceChoice("答案是厘米", mission.choices), "cm");
  assert.equal(parseVoiceChoice("应该是千米 km", mission.choices), "km");
  assert.equal(parseVoiceChoice("我还在想", mission.choices), null);

  const toneMission = MISSION_GAME_BY_ROUTE
    .get("/chinese/pinyin")!
    .missions.find((item) => item.id === "ma-three")!;
  assert.equal(parseVoiceChoice("答案是第三声", toneMission.choices), "three");

  const numberMission = MISSION_GAME_BY_ROUTE
    .get("/game/number-war")!
    .missions.find((item) => item.id === "compare-47-74")!;
  assert.equal(parseVoiceChoice("我觉得是七十四", numberMission.choices), "74");
  assert.equal(parseVoiceChoice("答案是74", numberMission.choices), "74");
});

test("语音局控制覆盖开始、下一题、朗读、结束和继续识别", () => {
  assert.equal(detectMissionGameCommand("开始一局"), "start");
  assert.equal(detectMissionGameCommand("再来一局"), "start");
  assert.equal(detectMissionGameCommand("下一个发现"), "next");
  assert.equal(detectMissionGameCommand("再听一遍"), "repeat");
  assert.equal(detectMissionGameCommand("检查轨道顺序"), "check");
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
