import assert from "node:assert/strict";
import { test } from "node:test";
import { audioFocus } from "./audio-focus";
test("creative audio leases are independent from microphones, reference counted and idempotent", () => {
  let changed = 0;
  const unsubscribe = audioFocus.subscribe(() => changed++);
  const first = audioFocus.acquireCreative(), second = audioFocus.acquireCreative();
  assert.equal(audioFocus.isCreativeActive(), true); assert.equal(audioFocus.isMicrophoneActive(), false);
  const mic = audioFocus.acquireMicrophone();
  first(); first();
  assert.equal(audioFocus.isCreativeActive(), true); assert.equal(changed, 4);
  second();
  assert.equal(audioFocus.isCreativeActive(), false); assert.equal(audioFocus.isMicrophoneActive(), true);
  mic(); unsubscribe();
  assert.equal(audioFocus.isMicrophoneActive(), false); assert.equal(changed, 6);
});
test("a microphone owner can ignore its own lease while still detecting another recorder", () => {
  const owner = Symbol(), mine = audioFocus.acquireMicrophone(owner);
  assert.equal(audioFocus.isMicrophoneActive(), true); assert.equal(audioFocus.isMicrophoneActive(owner), false);
  const other = audioFocus.acquireMicrophone(); assert.equal(audioFocus.isMicrophoneActive(owner), true);
  other(); assert.equal(audioFocus.isMicrophoneActive(owner), false); mine(); mine(); assert.equal(audioFocus.isMicrophoneActive(), false);
});
