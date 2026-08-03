import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceFreeAtomMotion,
  advanceStableStructureMotion,
  createInjectedAtomMotion,
  getStableStructureSlot,
} from "./particle-motion";

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

test("投放原子在数秒内离开右侧入口并扩散到反应炉多列", () => {
  const width = 1_800;
  const height = 900;
  const random = seededRandom(20260730);
  const particles = Array.from({ length: 20 }, (_, index) => (
    createInjectedAtomMotion({
      particleId: index + 1,
      index,
      count: 20,
      width,
      height,
      now: 0,
      random,
    })
  ));

  for (let frame = 1; frame <= 330; frame += 1) {
    const now = frame * 16.67;
    for (const particle of particles) {
      advanceFreeAtomMotion(particle, { width, height }, now, 1, random);
    }
  }

  const occupiedColumns = new Set(
    particles.map((particle) => Math.min(5, Math.floor((particle.x / width) * 6))),
  );
  const rightEdgeParticles = particles.filter((particle) => particle.x > width * 0.84);
  const averageX = particles.reduce((total, particle) => total + particle.x, 0) / particles.length;

  assert.ok(occupiedColumns.size >= 5, `只覆盖了 ${occupiedColumns.size} 个横向区域`);
  assert.ok(rightEdgeParticles.length <= 3, `仍有 ${rightEdgeParticles.length} 个原子挤在右侧`);
  assert.ok(averageX < width * 0.6, `平均横坐标仍偏右：${averageX}`);
});

test("分子工厂的半速倍率把游离粒子位移降到接近默认的一半", () => {
  const options = {
    particleId: 7,
    index: 0,
    count: 1,
    width: 1_200,
    height: 720,
    now: 0,
  };
  const fastRandom = seededRandom(20260803);
  const slowRandom = seededRandom(20260803);
  const fast = createInjectedAtomMotion({ ...options, random: fastRandom });
  const slow = createInjectedAtomMotion({ ...options, random: slowRandom });
  const start = { x: fast.x, y: fast.y };

  for (let frame = 1; frame <= 120; frame += 1) {
    const now = frame * 16.67;
    advanceFreeAtomMotion(fast, options, now, 1, fastRandom, 1);
    advanceFreeAtomMotion(slow, options, now, 1, slowRandom, 0.5);
  }

  const fastDistance = Math.hypot(fast.x - start.x, fast.y - start.y);
  const slowDistance = Math.hypot(slow.x - start.x, slow.y - start.y);
  assert.ok(slowDistance < fastDistance * 0.65, `${slowDistance} 应明显小于 ${fastDistance}`);
  assert.ok(slowDistance > fastDistance * 0.35, `${slowDistance} 不应接近静止`);
});

test("持续布朗运动始终遵守炉体边界", () => {
  const width = 760;
  const height = 520;
  const random = seededRandom(17);
  const particle = createInjectedAtomMotion({
    particleId: 1,
    index: 0,
    count: 1,
    width,
    height,
    now: 0,
    random,
  });

  for (let frame = 1; frame <= 2_000; frame += 1) {
    advanceFreeAtomMotion(particle, { width, height }, frame * 16.67, 1, random);
    assert.ok(particle.x >= particle.radius + 18);
    assert.ok(particle.x <= width - particle.radius - 18);
    assert.ok(particle.y >= particle.radius + 20);
    assert.ok(particle.y <= height - particle.radius - 40);
  }
});

test("减弱动效模式直接静态散布，不堆在右侧入口", () => {
  const width = 1_200;
  const height = 720;
  const particles = Array.from({ length: 10 }, (_, index) => (
    createInjectedAtomMotion({
      particleId: index + 1,
      index,
      count: 10,
      width,
      height,
      now: 0,
      reducedMotion: true,
    })
  ));

  assert.ok(particles.every((particle) => particle.vx === 0 && particle.vy === 0));
  assert.ok(particles.every((particle) => particle.x < width * 0.84));
  assert.ok(new Set(particles.map((particle) => Math.floor(particle.x / 200))).size >= 4);
});

test("十个稳定结构在桌面按五列两行均匀分布", () => {
  const bounds = { width: 1_500, height: 760 };
  const slots = Array.from(
    { length: 10 },
    (_, index) => getStableStructureSlot(index, 10, bounds),
  );

  assert.deepEqual([...new Set(slots.map((slot) => slot.centerX))].length, 5);
  assert.deepEqual([...new Set(slots.map((slot) => slot.centerY))].length, 2);
  assert.ok(slots.every((slot) => slot.columns === 5 && slot.rows === 2));
  assert.ok(slots.every((slot) => (
    slot.centerX - slot.width / 2 >= 0
    && slot.centerX + slot.width / 2 <= bounds.width
    && slot.centerY - slot.height * 0.46 >= 0
    && slot.centerY + slot.height * 0.54 <= bounds.height
  )));
});

test("窄屏把十个稳定结构改排为两列五行", () => {
  const slots = Array.from(
    { length: 10 },
    (_, index) => getStableStructureSlot(index, 10, { width: 520, height: 780 }),
  );

  assert.equal(new Set(slots.map((slot) => slot.centerX)).size, 2);
  assert.equal(new Set(slots.map((slot) => slot.centerY)).size, 5);
  assert.ok(slots.every((slot) => slot.columns === 2 && slot.rows === 5));
});

test("稳定结构以极低速度靠近自己的停泊位", () => {
  const slot = getStableStructureSlot(9, 10, { width: 1_500, height: 760 });
  const motion = {
    centerX: 400,
    centerY: 300,
    vx: 0,
    vy: 0,
    diffusionSeed: 3.14,
  };
  let maximumSpeed = 0;

  for (let frame = 1; frame <= 1_600; frame += 1) {
    advanceStableStructureMotion(motion, slot, frame * 33, 2);
    maximumSpeed = Math.max(maximumSpeed, Math.hypot(motion.vx, motion.vy));
  }

  assert.ok(maximumSpeed <= Math.hypot(0.72, 0.72) + 0.001);
  assert.ok(Math.hypot(motion.centerX - slot.centerX, motion.centerY - slot.centerY) < 10);
});

test("减弱动效时稳定结构直接进入停泊位", () => {
  const slot = getStableStructureSlot(4, 10, { width: 1_500, height: 760 });
  const motion = {
    centerX: 10,
    centerY: 10,
    vx: 1,
    vy: -1,
    diffusionSeed: 0,
  };

  advanceStableStructureMotion(motion, slot, 1_000, 1, true);

  assert.equal(motion.centerX, slot.centerX);
  assert.equal(motion.centerY, slot.centerY);
  assert.equal(motion.vx, 0);
  assert.equal(motion.vy, 0);
});
