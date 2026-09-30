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
