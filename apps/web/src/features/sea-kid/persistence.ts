import { PHYSICS, type Game } from './model';
export const SAVE_KEY = 'mumu:sea-kid:v1';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, lo = -1e9, hi = 1e12): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const integer = (v: unknown, lo = 0, hi = 1e9): v is number => number(v, lo, hi) && Number.isInteger(v);
const oneOf = (v: unknown, values: readonly unknown[]) => values.includes(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 150;
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
const strings = (v: unknown) => list(v, 10000) && v.every(text) && new Set(v).size === v.length;
function requireValue(ok: unknown): asserts ok { if (!ok) throw new Error('存档内容不完整，已保留原记录。'); }

export function parseGame(value: unknown): Game {
  requireValue(object(value));
  if (value.schemaVersion !== 1) throw new Error('存档版本不受支持，已保留原记录。');
  const g = value, l = g.level, p = g.player, b = g.boss;
  requireValue(text(g.id) && text(g.createdAt) && text(g.updatedAt) && Number.isFinite(Date.parse(g.createdAt)) && Number.isFinite(Date.parse(g.updatedAt)) && integer(g.revision));
  requireValue(object(l) && oneOf(l.generatorVersion, [1, 2]) && integer(l.seed, 0, 0xffffffff) && integer(l.world, 1) && oneOf(l.scene, [0, 1, 2]) && l.length === PHYSICS.length);
  requireValue(list(l.platforms, 500) && l.platforms.length > 1);
  const platforms = l.platforms;
  const platformRef = (v: unknown) => integer(v, 0, platforms.length - 1);
  platforms.forEach((raw, index) => {
    requireValue(object(raw) && raw.id === index && number(raw.x, 0, PHYSICS.length) && number(raw.y, 300, 500) && number(raw.w, 80, PHYSICS.length) && raw.x + raw.w <= PHYSICS.length + .01 && oneOf(raw.kind, ['ground', 'cloud', 'ice', 'fall', 'rise', 'sink']) && number(raw.amplitude, 0, 25) && number(raw.phase, 0, 7) && number(raw.period, 2, 8));
    if (index > 0) { const prev = platforms[index - 1] as Record<string, number>; requireValue(raw.x > prev.x && raw.x >= prev.x + prev.w - 11); }
  });
  const first = platforms[0] as Record<string, unknown>, last = platforms.at(-1) as Record<string, number>;
  requireValue(first.x === 0 && first.kind === 'ground' && last.x + last.w === PHYSICS.length);
  requireValue(list(l.pickups, 2000) && list(l.enemies, 500) && list(l.traps, 500));
  l.pickups.forEach(v => requireValue(object(v) && text(v.id) && oneOf(v.kind, ['hammer','firewheel','potion','scooter','ring','apple','banana','grapes']) && platformRef(v.platform) && number(v.x, 0, PHYSICS.length) && number(v.y, 100, 500)));
  l.enemies.forEach(v => requireValue(object(v) && text(v.id) && oneOf(v.kind, ['frog','snail','octopus','bat','lizard','hedgehog']) && platformRef(v.platform) && number(v.x, 0, PHYSICS.length) && number(v.y, 100, 500) && number(v.phase, 0, 7) && number(v.hp, 0, 1) && number(v.shotAt)));
  l.traps.forEach(v => requireValue(object(v) && oneOf(v.kind, ['flame','pusher','boulder','rock']) && platformRef(v.platform) && number(v.x, 0, PHYSICS.length) && number(v.phase, 0, 7) && number(v.fired)));
  for (const values of [l.pickups,l.enemies]) { const ids = values.map(v => (v as Record<string, unknown>).id); requireValue(new Set(ids).size === ids.length); }
  requireValue(object(p) && number(p.x, 0, PHYSICS.length) && number(p.y, -500, 1000) && number(p.vx, -1000, 1000) && number(p.vy, -1000, 3000) && oneOf(p.facing, [-1,1]) && (p.grounded === null || platformRef(p.grounded)) && oneOf(p.weapon, ['none','hammer','firewheel']) && oneOf(p.tier, [0,1,2]));
  for (const key of ['jumpHeld','scooter','ring']) requireValue(typeof p[key] === 'boolean');
  for (const key of ['coyote','jumpBuffer','invulnerable','hurt','attack','rescue']) requireValue(number(p[key], 0, 5));
  requireValue(number(p.safeX, 0, PHYSICS.length) && number(p.safeY, 200, 500));
  for (const key of ['time','score','completedDistance','deaths','stageScore']) requireValue(number(g[key], 0));
  requireValue(number(g.farthest, 0, PHYSICS.length) && strings(g.claimed) && strings(g.collected) && oneOf(g.phase, ['playing','dead','settlement']) && number(g.phaseTime, 0, 3));
  requireValue(object(b) && integer(b.kind, 0, 7) && number(b.maxHp, 10, 40) && number(b.hp, -2, 40) && number(b.x, 0, PHYSICS.length) && number(b.y, 0, 500) && number(b.hitAt) && number(b.shotAt) && typeof b.active === 'boolean');
  requireValue(object(g.fallen) && Object.keys(g.fallen).length <= platforms.length);
  for (const [key, v] of Object.entries(g.fallen)) requireValue(platformRef(Number(key)) && number(v, 0));
  requireValue(list(g.shots, 96));
  for (const s of g.shots) requireValue(object(s) && number(s.x, -100, PHYSICS.length + 100) && number(s.y, -2000, 1000) && number(s.vx, -1000, 1000) && number(s.vy, -1000, 3000) && number(s.life, 0, 6) && typeof s.friendly === 'boolean' && oneOf(s.kind, ['hammer','firewheel','water-shot','ink-shot','fire-shot','boulder']) && strings(s.hit));
  return value as unknown as Game;
}

export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export class SeaKidStore {
  private expected: string | null = null;
  private blocked = true;
  constructor(private storage: StoragePort) {}
  load(): Game | null {
    this.blocked = true;
    this.expected = this.storage.getItem(SAVE_KEY);
    if (this.expected && this.expected.length > 2_000_000) throw new Error('存档过大，原记录已保留。');
    const game = this.expected === null ? null : parseGame(JSON.parse(this.expected));
    this.blocked = false; return game;
  }
  save(game: Game) {
    if (this.blocked) throw new Error('请先恢复或备份原存档。');
    if (this.storage.getItem(SAVE_KEY) !== this.expected) { this.blocked = true; throw new Error('另一窗口修改了进度，请重新载入后继续。'); }
    const next = { ...game, updatedAt: new Date().toISOString(), revision: game.revision + 1 };
    parseGame(next);
    const raw = JSON.stringify(next);
    this.storage.setItem(SAVE_KEY, raw);
    this.expected = raw; game.updatedAt = next.updatedAt; game.revision = next.revision;
  }
}
