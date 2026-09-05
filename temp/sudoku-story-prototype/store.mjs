import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID, randomInt } from 'node:crypto';
import { LEVELS, THEMES, makeGame, act, publicGame, solve } from './engine.mjs';
const assert = (ok, message = '进度文件格式不兼容，请保留文件后检查') => { if (!ok) throw new Error(message); };
const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function validateState(s) {
  assert(s && s.schemaVersion === 1 && typeof s.id === 'string' && timestamp(s.createdAt) && timestamp(s.updatedAt));
  assert(Number.isSafeInteger(s.revision) && s.revision >= 0 && Array.isArray(s.receipts) && s.receipts.length <= 100 && s.receipts.every(x => typeof x === 'string'));
  assert(s.wallet && ['knowledge', 'energy'].every(k => Number.isSafeInteger(s.wallet[k]) && s.wallet[k] >= 0));
  assert(Array.isArray(s.history) && new Set(s.history.map(h => h.id)).size === s.history.length);
  for (const h of s.history) assert(h && typeof h.id === 'string' && LEVELS[h.level] && Number.isInteger(h.level) && THEMES.some(t => t.id === h.theme) && timestamp(h.completedAt) && typeof h.title === 'string');
  assert(['knowledge', 'energy'].every(k => s.wallet[k] === s.history.reduce((sum, h) => sum + LEVELS[h.level][k], 0)));
  if (!s.game) return s;
  const g = s.game, spec = LEVELS[g.level];
  assert(g && Number.isInteger(g.level) && spec && typeof g.id === 'string' && THEMES.some(t => t.id === g.theme) && Number.isSafeInteger(g.seed));
  assert(timestamp(g.createdAt) && timestamp(g.updatedAt) && (g.completedAt === null || timestamp(g.completedAt)));
  assert(Array.isArray(g.given) && g.given.length === spec.n ** 2 && Array.isArray(g.solution) && solve(g.solution, spec, 1).count === 1);
  assert(g.given.every((v, i) => Number.isInteger(v) && v >= 0 && v <= spec.n && (!v || v === g.solution[i])) && g.given.filter(Boolean).length === spec.clues);
  const answer = solve(g.given, spec); assert(answer.count === 1 && answer.first.every((v, i) => v === g.solution[i]));
  const cellsValid = cells => Array.isArray(cells) && cells.length === spec.n ** 2 && cells.every((c, i) => c && Number.isInteger(c.value) && c.value >= 0 && c.value <= spec.n && (!g.given[i] || c.value === g.given[i]) && typeof c.noted === 'boolean' && Array.isArray(c.crossed) && new Set(c.crossed).size === c.crossed.length && c.crossed.every(v => Number.isInteger(v) && v >= 1 && v <= spec.n));
  assert(cellsValid(g.cells) && Array.isArray(g.undo) && g.undo.length <= 200 && g.undo.every(cellsValid));
  assert(g.story && typeof g.story.title === 'string' && typeof g.story.teaser === 'string' && Array.isArray(g.story.rows) && g.story.rows.length === spec.n && g.story.rows.every(row => Array.isArray(row) && row.length === spec.n && row.every(p => typeof p === 'string' && p.length > 0 && p.length < 200)));
  assert(Boolean(g.completedAt) === s.history.some(h => h.id === g.id));
  if (g.completedAt) assert(g.cells.every((c, i) => c.value === g.solution[i]));
  return s;
}
export async function atomicWrite(path, state) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(tmp, JSON.stringify(state), { mode: 0o600, flag: 'wx' }); await rename(tmp, path); }
  finally { await rm(tmp, { force: true }).catch(() => {}); }
}
export class Store {
  constructor(dir, writer = atomicWrite) { this.path = join(dir, 'progress.v1.json'); this.writer = writer; this.queue = Promise.resolve(); this.state = null; }
  async load() {
    try { this.state = validateState(JSON.parse(await readFile(this.path, 'utf8'))); }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('进度文件暂时无法读取。文件已保留，请检查后重新启动原型'); const now = new Date().toISOString(); this.state = { schemaVersion: 1, id: randomUUID(), createdAt: now, updatedAt: now, revision: 0, wallet: { knowledge: 0, energy: 0 }, game: null, history: [], receipts: [] }; }
  }
  view(message = '') { return { revision: this.state.revision, wallet: this.state.wallet, game: publicGame(this.state.game), history: this.state.history.slice(-30).reverse(), message }; }
  mutate(body) {
    const task = this.queue.then(async () => {
      assert(body && typeof body === 'object' && typeof body.operationId === 'string' && /^[a-zA-Z0-9-]{10,80}$/.test(body.operationId), '操作信息不完整，请刷新后重试');
      if (this.state.receipts.includes(body.operationId)) return this.view('这一步已经保存了');
      if (body.revision !== this.state.revision) { const e = new Error('另一页更新了进度，已保留最新记录，请刷新后继续'); e.status = 409; throw e; }
      const next = structuredClone(this.state), now = new Date().toISOString(); let message;
      if (body.type === 'new') {
        assert(Number.isInteger(body.level) && LEVELS[body.level] && THEMES.some(t => t.id === body.theme), '请选择难度与故事世界');
        next.game = makeGame(body.level, body.theme, randomInt(0x100000000), randomUUID()); message = '新故事准备好了，点一个空格开始吧';
      } else {
        assert(next.game && next.game.id === body.gameId, '这局已经更换，请刷新后继续');
        const result = act(next.game, body); message = result.message;
        if (body.type === 'hint') return { ...this.view(message), hintValues: result.hintValues ?? [] };
        if (result.completed && !next.history.some(h => h.id === next.game.id)) {
          const spec = LEVELS[next.game.level]; next.game.completedAt = now;
          next.wallet.knowledge += spec.knowledge; next.wallet.energy += spec.energy;
          next.history.push({ id: next.game.id, level: next.game.level, theme: next.game.theme, title: next.game.story.title, completedAt: now });
          message = `故事拼好了！获得 ${spec.knowledge} 知识币和 ${spec.energy} 能量币`;
        }
        next.game.updatedAt = now;
      }
      next.updatedAt = now; next.revision++; next.receipts.push(body.operationId); next.receipts = next.receipts.slice(-100);
      try { await this.writer(this.path, next); } catch { throw new Error('暂时没有保存成功，之前的进度还在。请点击重试'); }
      this.state = next; return this.view(message);
    });
    this.queue = task.catch(() => {}); return task;
  }
}
