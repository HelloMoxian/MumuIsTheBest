import assert from "node:assert/strict";
import test from "node:test";
import { isTwentyFourView } from "./api";
import { emptyEditor } from "../../../../server/src/twenty-four-editor";
import { initialBoard, type Expression } from "../../../../server/src/twenty-four-engine";
const id = "11111111-1111-4111-8111-111111111111";
const base = () => ({
  schemaVersion: 1, revision: 1, completedCount: 0, pendingRewards: 0, history: [], reward: null, settlement: null,
  game: { id, cards: [3, 3, 8, 8, 0, 11, 12, 13], board: initialBoard(), elapsedMs: 0, paused: false, assisted: false, completedAt: null, canUndo: false, solution: null, editor: emptyEditor(), canUndoEditor: false },
});
test("接受完整空状态、初始棋盘和服务端参考解，拒绝畸形应答", () => {
  assert(isTwentyFourView(base()));
  assert(isTwentyFourView({ ...base(), game: null }));
  for (const game of [
    { ...base().game, cards: [] }, { ...base().game, cards: [3, 3, 8, 8, 0, 11, 12, 14] },
    { ...base().game, board: [{ card: 0 }, { card: 0 }, ...initialBoard().slice(2)] },
    { ...base().game, elapsedMs: -1 }, { ...base().game, paused: "yes" },
    { ...base().game, completedAt: new Date().toISOString() }, { ...base().game, solution: { card: 0 } },
  ]) assert(!isTwentyFourView({ ...base(), game }));
  const solution: Expression = { op: "+", left: { op: "+", left: { card: 5 }, right: { card: 7 } }, right: { op: "-", left: { card: 0 }, right: { card: 1 } } };
  assert(isTwentyFourView({ ...base(), game: { ...base().game, assisted: true, solution } }));
  assert(!isTwentyFourView({ ...base(), game: { ...base().game, solution } }));
  assert(!isTwentyFourView({ ...base(), reward: { amount: 40, status: "granted" } }));
  assert(!isTwentyFourView({ ...base(), settlement: { eventId: id, amount: 999, balance: 0, updatedAt: new Date().toISOString() } }));
});
