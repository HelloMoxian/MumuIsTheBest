import { PHYSICS, clamp, type Level, type Platform, type Scene, type PickupKind, type EnemyKind } from './model';

export function randomSource(seed: number) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function jumpReach(down: number) {
  const discriminant = PHYSICS.jump ** 2 + 2 * PHYSICS.gravity * down;
  return discriminant < 0 ? 0 : PHYSICS.run * (PHYSICS.jump + Math.sqrt(discriminant)) / PHYSICS.gravity;
}
/** Both lift extremes are considered; reserve room for a full body and imperfect takeoff. */
export function safeGap(a: Platform, b: Platform) {
  return Math.max(0, jumpReach(b.y - a.y - a.amplitude - b.amplitude) - PHYSICS.width - 32);
}
export function generateLevel(world: number, scene: Scene, seed: number): Level {
  if (!Number.isSafeInteger(world) || world < 1 || ![0, 1, 2].includes(scene) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('关卡参数无效');
  const random = randomSource(seed), range = (lo: number, hi: number) => Math.round((lo + random() * (hi - lo)) * 10) / 10;
  const difficulty = 1 - Math.exp(-Math.max(0, world - 3) / 8);
  const level: Level = { generatorVersion: 1, seed, world, scene, length: PHYSICS.length, platforms: [], pickups: [], enemies: [], traps: [] };
  const add = (x: number, y: number, w: number, kind: Platform['kind'] = scene === 1 ? 'cloud' : 'ground'): Platform => {
    const p: Platform = { id: level.platforms.length, x, y, w, kind, amplitude: kind === 'rise' || kind === 'sink' ? 20 : 0, phase: range(0, Math.PI * 2), period: range(3.4, 5) };
    level.platforms.push(p); return p;
  };
  add(0, 438, 480, 'ground');
  const end = scene === 2 ? PHYSICS.length - PHYSICS.arena : PHYSICS.length - 420;
  let step = 0;
  while (level.platforms.at(-1)!.x + level.platforms.at(-1)!.w < end) {
    const previous = level.platforms.at(-1)!;
    const progress = previous.x + previous.w;
    let kind: Platform['kind'] = scene === 1 ? 'cloud' : (scene === 2 && world > 3 && random() < .2 ? 'ice' : 'ground');
    if (world > 8 && step % 4 === 2) kind = (['fall', 'rise', 'sink'] as const)[Math.floor(random() * 3)];
    const amplitude = kind === 'rise' || kind === 'sink' ? 20 : 0;
    const heightStep = amplitude || previous.amplitude ? 20 : 46;
    const y = clamp(previous.y + range(-heightStep, heightStep), 350, 466);
    const p: Platform = { id: 0, x: 0, y, w: 0, kind, amplitude, phase: 0, period: 4 };
    const limit = safeGap(previous, p);
    const hasGap = scene === 1 || (world > 3 && random() < .25 + difficulty * .6);
    let gap = hasGap ? range(limit * (.18 + difficulty * .39), limit * (.4 + difficulty * .55)) : 0;
    if (world <= 3) gap = scene === 1 ? range(-10, 5) : 0;
    const x = progress + gap;
    const w = Math.min(end - x, range(130 + (1 - difficulty) * 100, 260 + (1 - difficulty) * 280));
    if (w < 120) { previous.w = end - previous.x; break; }
    add(x, y, w, kind); step++;
  }
  const prev = level.platforms.at(-1)!;
  if (scene === 2) {
    const ay = prev.y;
    if (world < 8) add(end, ay, PHYSICS.arena, 'ground');
    else {
      const gap = 95 + difficulty * 65;
      add(end, ay, 390, 'ground'); add(end + 390 + gap, ay, 360, 'ground');
      add(end + 750 + 2 * gap, ay, PHYSICS.arena - 750 - 2 * gap, 'ground');
    }
  } else add(end, prev.y, 420, 'ground');
  const pickup = (kind: PickupKind, p: Platform, x: number, height = 35) => level.pickups.push({ id: `p${level.pickups.length}`, kind, platform: p.id, x, y: p.y - height });
  pickup('hammer', level.platforms[0], 220);
  const enemyKinds: EnemyKind[] = scene === 0 ? ['frog', 'snail', 'lizard', 'hedgehog'] : scene === 1 ? ['octopus', 'bat', 'frog'] : ['bat', 'hedgehog', 'snail', 'lizard'];
  for (const p of level.platforms) {
    if (p.id === 0 || p.x >= end) continue;
    const x = p.x + p.w * .5;
    if (p.id % 4 === 1) pickup((['potion', 'firewheel', 'scooter', 'ring'] as const)[Math.floor(p.id / 4) % 4], p, x);
    else for (let f = 0; f < 3; f++) pickup((['apple', 'banana', 'grapes'] as const)[f], p, p.x + p.w * (.27 + f * .23), 35 + (f === 1 ? 35 : 0));
    if (random() < .25 + difficulty * .68) {
      const n = scene === 0 && difficulty > .6 && p.w > 250 ? 2 : 1;
      for (let e = 0; e < n; e++) level.enemies.push({ id: `e${level.enemies.length}`, kind: enemyKinds[Math.floor(random() * enemyKinds.length)], platform: p.id, x: p.x + p.w * (.45 + .27 * e), y: p.y, phase: range(0, 6.28), hp: 1, shotAt: -range(0, 4) });
    }
    if (p.id % (world > 8 ? 3 : 7) === 2 && !['fall', 'rise', 'sink'].includes(p.kind)) {
      const kinds = world > 8 ? ['flame', 'pusher', 'boulder', 'rock'] as const : ['rock', 'flame'] as const;
      level.traps.push({ kind: kinds[Math.floor(random() * kinds.length)], platform: p.id, x: p.x + p.w * .7, phase: range(0, 6), fired: -99 });
    }
  }
  if (scene === 2) { const p = level.platforms.find(p => p.x === end)!; pickup('hammer', p, end + 100); }
  return level;
}

export function platformY(p: Platform, time: number, fallen: Record<string, number>): number {
  const start = fallen[p.id];
  if (p.kind === 'fall' && start !== undefined) {
    const dt = time - start;
    if (dt > .8 && dt < 4.5) return p.y + Math.min(1200, (dt - .8) ** 2 * 460);
  }
  const direction = p.kind === 'sink' ? -1 : 1;
  return p.y + direction * p.amplitude * Math.sin(time * Math.PI * 2 / p.period + p.phase);
}
