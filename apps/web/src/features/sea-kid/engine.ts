import { generateLevel, platformY } from './generator';
import { PHYSICS, BOSS_SPRITES, blankPlayer, clamp, type Game, type Input, type Platform, type Shot } from './model';
import { advanceEffects, effectsFor, resetEffects, rockId, showDefeat, showScore } from './effects';

export function newGame(seed: number, id: string, now = new Date().toISOString()): Game {
  const game: Game = { schemaVersion: 1, id, createdAt: now, updatedAt: now, revision: 0, level: generateLevel(1, 0, seed), player: blankPlayer(), time: 0, score: 0, completedDistance: 0, farthest: 0, deaths: 0, claimed: [], collected: [], shots: [], fallen: {}, boss: { kind: 0, hp: 12, maxHp: 12, x: 0, y: 0, hitAt: -1, shotAt: -1, active: false }, phase: 'playing', phaseTime: 0, stageScore: 0 };
  resetStage(game, false); return game;
}
export function resetStage(g: Game, clearEquipment: boolean) {
  resetEffects(g);
  const old = g.player;
  g.player = blankPlayer(); g.player.y = g.level.platforms[0].y - PHYSICS.height;
  g.player.safeY = g.player.y;
  if (!clearEquipment) Object.assign(g.player, { weapon: old.weapon, tier: old.tier, scooter: old.scooter, ring: old.ring });
  g.time = 0; g.phase = 'playing'; g.phaseTime = 0; g.collected = []; g.shots = []; g.fallen = {};
  for (const e of g.level.enemies) { e.hp = 1; e.shotAt = -e.phase; }
  for (const t of g.level.traps) t.fired = -99;
  const hp = 10 + Math.min(30, g.level.world * 2);
  const last = g.level.platforms.at(-1)!;
  g.boss = { kind: (g.level.world - 1) % 8, hp, maxHp: hp, x: g.level.length - 145, y: last.y - 100, hitAt: -1, shotAt: -1, active: false };
}
export function reroute(g: Game, seed: number) {
  g.level = generateLevel(g.level.world, g.level.scene, seed); g.claimed = []; resetStage(g, false);
}
export function nextStage(g: Game) {
  const scene = g.level.scene === 2 ? 0 : (g.level.scene + 1) as 1 | 2;
  const world = g.level.world + (g.level.scene === 2 ? 1 : 0);
  g.completedDistance += g.level.length; g.farthest = 0; g.claimed = []; g.stageScore = g.score;
  g.level = generateLevel(world, scene, (Math.imul(g.level.seed, 1664525) + 1013904223) >>> 0);
  resetStage(g, false);
}
export function earn(g: Game, id: string, score: number) {
  if (g.claimed.includes(id)) return false;
  g.claimed.push(id); g.score += score;
  return true;
}
export function hurt(g: Game, from: number, push = false) {
  const p = g.player;
  if (p.invulnerable > 0) return;
  // Equipment has a lower bound, not permanent immunity: contact still knocks back.
  if (p.scooter) p.scooter = false;
  else if (p.tier > 0) p.tier = (p.tier - 1) as 0 | 1;
  p.hurt = .26; p.invulnerable = 1.15; p.vx = (p.x < from ? -1 : 1) * 240; p.vy = -200; p.grounded = null;
  void push;
}
function addShot(g: Game, shot: Omit<Shot, 'hit'>) {
  // Persistent stones must never use the slots needed to attack and destroy them.
  if (g.shots.length >= 96 || (!shot.friendly && g.shots.filter(s => !s.friendly).length >= 80)) return;
  g.shots.push({ ...shot, hit: [] });
}
function enemyShot(g: Game, x: number, y: number, kind: Shot['kind'], speed: number, vy = 0) {
  addShot(g, { x, y, vx: (g.player.x < x ? -1 : 1) * speed, vy, kind, friendly: false, life: 5 });
}
export function trapActive(time: number, phase: number) { return (time + phase) % 3.6 > 1.65 && (time + phase) % 3.6 < 2.65; }
export function enemyPosition(g: Game, e: Game['level']['enemies'][number]) {
  const p = g.level.platforms[e.platform];
  return { x: clamp(e.x + Math.sin(g.time * (e.kind === 'lizard' ? 2.4 : 1.3) + e.phase) * Math.min(50, p.w / 4), p.x + 24, p.x + p.w - 24), y: platformY(p, g.time, g.fallen) - (e.kind === 'bat' ? 95 + Math.sin(g.time * 3 + e.phase) * 30 : e.kind === 'frog' ? Math.max(0, Math.sin(g.time * 2 + e.phase)) * 35 : 0) };
}
function settle(g: Game) { g.farthest = g.level.length; g.phase = 'settlement'; g.phaseTime = 1.8; g.shots = []; }
function arenaBoss(g: Game, dt: number) {
  const b = g.boss, start = g.level.length - PHYSICS.arena;
  if (g.level.scene !== 2 || b.hp <= 0) return;
  if (g.player.x >= start + 24) b.active = true;
  if (!b.active) return;
  const last = g.level.platforms.at(-1)!;
  const t = g.time, k = b.kind;
  // Eight readable movement/shot patterns, each with a visible windup cycle.
  b.x = last.x + last.w / 2 + Math.sin(t * (k === 1 || k === 5 ? 2.5 : .85)) * Math.min(last.w / 2 - 58, k === 1 || k === 5 ? 150 : 50);
  b.y = last.y - 100 - ((k === 0 || k === 4) ? Math.max(0, Math.sin(t * 1.7)) * 90 : k === 3 ? 80 + Math.sin(t * 2) * 50 : 0);
  const interval = Math.max(1.25, 3 - g.level.world * .055);
  if (t - b.shotAt > interval) {
    b.shotAt = t;
    if (k === 6 || k === 7) {
      for (let i = 0; i < 3; i++) addShot(g, { x: clamp(g.player.x + (i - 1) * 110, start + 90, g.level.length - 50), y: 40, vx: 0, vy: 15, kind: 'boulder', friendly: false, life: 3 });
    } else {
      const kind = k === 2 ? 'ink-shot' : k === 4 ? 'fire-shot' : 'water-shot';
      const spreads = k === 2 || k === 3 ? [-85, 0, 85] : [0];
      for (const vy of spreads) enemyShot(g, b.x, b.y + 45, kind, 160 + Math.min(140, g.level.world * 7), vy);
    }
  }
  if (Math.abs(g.player.x + 14 - b.x) < 65 && Math.abs(g.player.y + 24 - (b.y + 50)) < 68) hurt(g, b.x);
  void dt;
}
/** Fixed 120Hz simulation. Coordinates are continuous; tiles never decide collisions. */
export function tick(g: Game, input: Input, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0 || dt > .05) return;
  advanceEffects(g, dt);
  if (g.phase !== 'playing') {
    g.phaseTime -= dt;
    if (g.phaseTime <= 0) { if (g.phase === 'dead') resetStage(g, true); else nextStage(g); }
    return;
  }
  const p = g.player, oldTime = g.time, oldX = p.x; g.time += dt;
  p.invulnerable = Math.max(0, p.invulnerable - dt); p.hurt = Math.max(0, p.hurt - dt); p.attack = Math.max(0, p.attack - dt); p.rescue = Math.max(0, p.rescue - dt);
  if (p.grounded !== null) {
    const ground = g.level.platforms[p.grounded];
    const oldY = platformY(ground, oldTime, g.fallen), newY = platformY(ground, g.time, g.fallen);
    if (ground.kind === 'fall' && g.fallen[ground.id] !== undefined && g.time - g.fallen[ground.id] > .8) p.grounded = null;
    else p.y += newY - oldY;
  }
  p.coyote = p.grounded !== null ? .10 : Math.max(0, p.coyote - dt);
  if (input.jump && !p.jumpHeld) p.jumpBuffer = .12;
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.jumpHeld = input.jump;
  const direction = Number(input.right) - Number(input.left);
  const speed = input.run ? PHYSICS.run : PHYSICS.walk;
  const target = direction * Math.min(PHYSICS.maxSpeed, speed + (p.tier === 2 ? 80 : 0) + (p.scooter ? 60 : 0));
  if (p.hurt === 0) {
    const ice = p.grounded !== null && g.level.platforms[p.grounded].kind === 'ice';
    const acceleration = !direction && ice ? 480 : PHYSICS.acceleration;
    p.vx += clamp(target - p.vx, -acceleration * dt, acceleration * dt);
    if (direction) p.facing = direction;
  }
  if (p.jumpBuffer > 0 && p.coyote > 0 && p.hurt === 0) { p.vy = -(PHYSICS.jump + (p.tier > 0 ? 100 : 0)); p.grounded = null; p.coyote = 0; p.jumpBuffer = 0; }
  if (input.attack && p.attack === 0 && p.weapon !== 'none') {
    p.attack = p.weapon === 'hammer' ? .27 : .20;
    addShot(g, { x: p.x + 14 + p.facing * 28, y: p.y + 17, vx: p.facing * (p.weapon === 'hammer' ? 550 : 660), vy: p.weapon === 'hammer' ? -230 : 0, kind: p.weapon, friendly: true, life: 1.7 });
  }
  const oldBottom = p.y + PHYSICS.height;
  p.x += p.vx * dt;
  const arenaStart = g.level.length - PHYSICS.arena;
  p.x = clamp(p.x, g.boss.active ? arenaStart + 12 : 0, g.level.length - PHYSICS.width);
  // Solid banks have side walls. Thin clouds/lifts are one-way landing surfaces.
  for (const platform of g.level.platforms) {
    if (!['ground', 'ice'].includes(platform.kind)) continue;
    const top = platform.y;
    if (p.y + PHYSICS.height > top + 5 && p.y < 640 && p.x + PHYSICS.width > platform.x && p.x < platform.x + platform.w) {
      if (p.vx > 0 && p.x < platform.x) p.x = platform.x - PHYSICS.width;
      else if (p.vx < 0 && p.x + PHYSICS.width > platform.x + platform.w) p.x = platform.x + platform.w;
      else continue;
      p.vx = 0;
    }
  }
  p.vy += PHYSICS.gravity * dt; p.y += p.vy * dt; p.grounded = null;
  if (p.vy >= 0) {
    let landing: { p: Platform; y: number } | undefined;
    for (const platform of g.level.platforms) {
      const top = platformY(platform, g.time, g.fallen), oldTop = platformY(platform, oldTime, g.fallen);
      if (top > 620 || (platform.kind === 'fall' && g.fallen[platform.id] !== undefined && g.time - g.fallen[platform.id] > .8 && g.time - g.fallen[platform.id] < 4.5)) continue;
      if (p.x + PHYSICS.width > platform.x + 2 && p.x < platform.x + platform.w - 2 && oldBottom <= oldTop + 5 && p.y + PHYSICS.height >= top && (!landing || top < landing.y)) landing = { p: platform, y: top };
    }
    if (landing) {
      p.y = landing.y - PHYSICS.height; p.vy = 0; p.grounded = landing.p.id;
      if (landing.p.kind === 'fall' && (g.fallen[landing.p.id] === undefined || g.time - g.fallen[landing.p.id] >= 4.5)) g.fallen[landing.p.id] = g.time;
      if (!['fall', 'rise', 'sink'].includes(landing.p.kind) && landing.p.w > 95) { p.safeX = clamp(p.x, landing.p.x + 30, landing.p.x + landing.p.w - 60); p.safeY = p.y; }
    }
  }
  g.farthest = Math.max(g.farthest, p.x);
  if (p.grounded !== null && !p.scooter) effectsFor(g).stride += Math.abs(p.x - oldX);
  if (p.y > 640) {
    if (p.ring && g.level.scene === 1) { p.ring = false; p.x = p.safeX; p.y = p.safeY - 25; p.vx = 0; p.vy = -180; p.invulnerable = 2; p.rescue = .8; g.shots = []; }
    else { g.deaths++; g.phase = 'dead'; g.phaseTime = .65; }
    return;
  }
  for (const pickup of g.level.pickups) {
    if (g.collected.includes(pickup.id)) continue;
    const platform = g.level.platforms[pickup.platform];
    const y = pickup.y + platformY(platform, g.time, g.fallen) - platform.y;
    if (Math.abs(p.x + 14 - pickup.x) < 34 && Math.abs(p.y + 24 - y) < 42) {
      const fruit = ['apple', 'banana', 'grapes'].includes(pickup.kind), points = fruit ? 50 : 100;
      g.collected.push(pickup.id);
      if (earn(g, pickup.id, points)) showScore(g, pickup.x, y - 16, points);
      if (!fruit) effectsFor(g).boost = 1;
      if (pickup.kind === 'hammer' || pickup.kind === 'firewheel') p.weapon = pickup.kind;
      if (pickup.kind === 'potion') { p.tier = Math.min(2, p.tier + 1) as 1 | 2; if (p.weapon === 'none') p.weapon = 'hammer'; }
      if (pickup.kind === 'scooter') p.scooter = true;
      if (pickup.kind === 'ring') p.ring = true;
    }
  }
  for (const e of g.level.enemies) {
    if (e.hp <= 0) continue;
    const pos = enemyPosition(g, e);
    if (Math.abs(pos.x - p.x) > 850) continue;
    if (g.time - e.shotAt > Math.max(1.6, 4.7 - g.level.world * .11)) {
      e.shotAt = g.time; enemyShot(g, pos.x, pos.y - 25, e.kind === 'octopus' ? 'ink-shot' : 'water-shot', 130 + Math.min(130, g.level.world * 5));
    }
    if (Math.abs(pos.x - (p.x + 14)) < 30 && Math.abs(pos.y - 23 - (p.y + 24)) < 38) hurt(g, pos.x);
  }
  for (const [index, trap] of g.level.traps.entries()) {
    if (trap.kind === 'rock' && g.collected.includes(rockId(index))) continue;
    if (Math.abs(trap.x - p.x) > 800) continue;
    const ground = g.level.platforms[trap.platform], y = platformY(ground, g.time, g.fallen);
    const active = trapActive(g.time, trap.phase);
    if (trap.kind === 'boulder' && active && g.time - trap.fired > 2 && !g.shots.some(s => s.kind === 'boulder' && Math.abs(s.x - trap.x) < 35)) { trap.fired = g.time; addShot(g, { x: trap.x, y: 50, vx: 0, vy: 0, kind: 'boulder', friendly: false, life: 3 }); }
    if ((active || trap.kind === 'rock') && Math.abs(p.x + 14 - trap.x) < (trap.kind === 'pusher' ? 72 : 35) && p.y + 48 > y - (trap.kind === 'flame' ? 84 : 30) && p.y < y) {
      if (trap.kind !== 'boulder') hurt(g, trap.x, trap.kind === 'pusher');
    }
  }
  arenaBoss(g, dt);
  for (const s of g.shots) {
    if (s.life <= 0) continue;
    const oldY = s.y;
    s.life -= dt; if (s.kind === 'hammer' || s.kind === 'boulder') s.vy += (s.kind === 'hammer' ? 640 : 650) * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.kind === 'boulder' && !s.friendly && s.vy >= 0) {
      let floor = Infinity;
      for (const platform of g.level.platforms) {
        const top = platformY(platform, g.time, g.fallen);
        if (top <= 620 && s.x + 24 > platform.x && s.x - 24 < platform.x + platform.w && oldY + 31 <= top + 5 && s.y + 31 >= top) floor = Math.min(floor, top);
      }
      if (floor < Infinity) { s.y = floor - 31; s.vy = 0; s.life = 6; }
    }
    if (s.friendly) {
      for (const [index, trap] of g.level.traps.entries()) {
        const id = rockId(index);
        if (s.life <= 0 || trap.kind !== 'rock' || g.collected.includes(id)) continue;
        const y = platformY(g.level.platforms[trap.platform], g.time, g.fallen);
        if (Math.abs(s.x - trap.x) < 38 && Math.abs(s.y - (y - 18)) < 34) {
          g.collected.push(id); showDefeat(g, 'rock', trap.x, y, 50, 36, s.vx);
          if (s.kind === 'hammer') s.life = 0;
        }
      }
      for (const stone of g.shots) {
        if (s.life <= 0 || stone.life <= 0 || stone.friendly || stone.kind !== 'boulder') continue;
        if (Math.abs(s.x - stone.x) < 43 && Math.abs(s.y - stone.y) < 43) {
          stone.life = 0; showDefeat(g, 'boulder', stone.x, stone.y + 31, 62, 62, s.vx);
          if (s.kind === 'hammer') s.life = 0;
        }
      }
      for (const e of g.level.enemies) {
        if (s.life <= 0 || e.hp <= 0 || s.hit.includes(e.id)) continue;
        const pos = enemyPosition(g, e);
        if (Math.abs(s.x - pos.x) < 31 && Math.abs(s.y - (pos.y - 25)) < 32) {
          e.hp = 0; s.hit.push(e.id);
          showDefeat(g, e.kind, pos.x, pos.y, e.kind === 'bat' ? 60 : 48, e.kind === 'snail' ? 32 : 44, s.vx);
          if (earn(g, e.id, 150)) showScore(g, pos.x, pos.y - 50, 150);
          if (s.kind === 'hammer') s.life = 0;
        }
      }
      const b = g.boss;
      if (s.life > 0 && b.active && b.hp > 0 && !s.hit.includes('boss') && Math.abs(s.x - b.x) < 58 && Math.abs(s.y - (b.y + 50)) < 60) {
        s.hit.push('boss'); s.life = 0;
        if (g.time - b.hitAt > .16) { b.hp -= p.tier === 2 ? 2 : 1; b.hitAt = g.time; if (b.hp <= 0) {
          showDefeat(g, BOSS_SPRITES[b.kind], b.x, b.y + 100, 130, 120, s.vx);
          const points = 1000 + g.level.world * 100;
          if (earn(g, 'boss', points)) showScore(g, b.x, b.y, points);
          settle(g); break;
        } }
      }
    } else if (s.life > 0 && Math.abs(s.x - (p.x + 14)) < (s.kind === 'boulder' ? 35 : 22) && Math.abs(s.y - (p.y + 24)) < (s.kind === 'boulder' ? 42 : 30)) { hurt(g, s.x); if (s.kind !== 'boulder') s.life = 0; }
  }
  g.shots = g.shots.filter(s => s.life > 0 && s.y < 700 && s.x > 0 && s.x < g.level.length);
  if (g.level.scene !== 2 && p.x >= g.level.length - 70) settle(g);
}
