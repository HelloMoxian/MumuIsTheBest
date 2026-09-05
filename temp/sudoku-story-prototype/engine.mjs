export const LEVELS = [
  { name: '星芽启程', n: 4, h: 2, w: 2, clues: 10, knowledge: 5, energy: 2 },
  { name: '月光寻路', n: 4, h: 2, w: 2, clues: 7, knowledge: 10, energy: 4 },
  { name: '彗星探险', n: 6, h: 2, w: 3, clues: 23, knowledge: 18, energy: 7 },
  { name: '星云解谜', n: 6, h: 2, w: 3, clues: 16, knowledge: 28, energy: 11 },
  { name: '银河领航', n: 9, h: 3, w: 3, clues: 42, knowledge: 45, energy: 18 },
  { name: '宇宙织梦', n: 9, h: 3, w: 3, clues: 30, knowledge: 70, energy: 28 },
];
export const THEMES = [
  { id: 'gems', name: '水晶花园', tag: '让沉睡的水晶开花', place: '水晶花园', object: '彩虹种子', friend: '水晶鹿', destination: '月光花坛' },
  { id: 'elements', name: '原子星港', tag: '为小小研究站点亮星灯', place: '原子星港', object: '星光灯芯', friend: '机器人点点', destination: '观察小屋' },
  { id: 'numbers', name: '数字航海', tag: '顺着数字找到星海里的灯塔', place: '数字星海', object: '发光贝壳', friend: '小鲸鱼', destination: '星海灯塔' },
  { id: 'letters', name: '字母邮局', tag: '把一封温暖的信送到远方', place: '字母星球', object: '星星信封', friend: '信使猫头鹰', destination: '云朵邮局' },
  { id: 'crew', name: '伙伴营地', tag: '和不同的小伙伴搭起星空营地', place: '星空营地', object: '帐篷星灯', friend: '小熊团团', destination: '山顶营地' },
];
export const range = n => Array.from({ length: n }, (_, i) => i);
export function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function shuffle(list, random) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function peers(i, spec) {
  const { n, h, w } = spec, r = Math.floor(i / n), c = i % n;
  return range(n * n).filter(j => j !== i && (Math.floor(j / n) === r || j % n === c || (Math.floor(Math.floor(j / n) / h) === Math.floor(r / h) && Math.floor((j % n) / w) === Math.floor(c / w))));
}
export function choices(board, i, spec) { const used = new Set(peers(i, spec).map(j => board[j])); return range(spec.n).map(v => v + 1).filter(v => !used.has(v)); }
export function solve(input, spec, limit = 2, random) {
  const b = [...input], allPeers = range(b.length).map(i => peers(i, spec)); let count = 0, first = null;
  if (b.length !== spec.n ** 2 || b.some((v, i) => !Number.isInteger(v) || v < 0 || v > spec.n || v && allPeers[i].some(j => b[j] === v))) return { count: 0, first: null };
  function visit() {
    let best = -1, opts = [];
    for (let i = 0; i < b.length; i++) if (!b[i]) {
      const used = new Set(allPeers[i].map(j => b[j])); const available = range(spec.n).map(x => x + 1).filter(v => !used.has(v));
      if (!available.length) return;
      if (best < 0 || available.length < opts.length) { best = i; opts = available; if (opts.length === 1) break; }
    }
    if (best < 0) { count++; first ??= [...b]; return; }
    for (const v of random ? shuffle(opts, random) : opts) { b[best] = v; visit(); b[best] = 0; if (count >= limit) return; }
  }
  visit(); return { count, first };
}
function patternSolution(spec, random) {
  const { n, h, w } = spec;
  const rows = shuffle(range(n / h), random).flatMap(b => shuffle(range(h), random).map(r => b * h + r));
  const cols = shuffle(range(n / w), random).flatMap(b => shuffle(range(w), random).map(c => b * w + c));
  const symbols = shuffle(range(n).map(v => v + 1), random);
  return rows.flatMap(r => cols.map(c => symbols[(w * (r % h) + Math.floor(r / h) + c) % n]));
}
export function generatePuzzle(level, seed) {
  if (!Number.isInteger(level) || !LEVELS[level]) throw new Error('请选择六档难度之一');
  const spec = LEVELS[level], random = rng(seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    const algorithm = random() < .5 ? '随机回溯' : '结构置换';
    const solution = algorithm === '随机回溯' ? solve(Array(spec.n ** 2).fill(0), spec, 1, random).first : patternSolution(spec, random);
    const given = [...solution]; let count = given.length;
    const order = random() < .5 ? shuffle(range(given.length), random) : shuffle(range(Math.ceil(given.length / 2)), random).flatMap(i => i === given.length - 1 - i ? [i] : [i, given.length - 1 - i]);
    for (const i of order) { const old = given[i]; given[i] = 0; if (solve(given, spec).count !== 1) given[i] = old; else count--; if (count === spec.clues) break; }
    if (count === spec.clues) return { given, solution, algorithm, seed, level };
  }
  throw new Error('这一页还没有准备好，请再生成一次');
}
export function generateStory(themeId, n, seed) {
  const theme = THEMES.find(t => t.id === themeId); if (!theme) throw new Error('请选择一个故事世界');
  const random = rng(seed ^ 0xABCDEF), pick = a => a[Math.floor(random() * a.length)];
  const hero = pick(['小兔米米', '小狐狸阿星', '小熊朵朵', '小猫木木', '小象泡泡', '小鹿芽芽', '企鹅圆圆', '小狗布丁']);
  const time = pick(['清晨', '一个晴天', '午后', '星星亮起时']);
  const vehicle = pick(['月亮小船', '泡泡飞车', '云朵巴士', '纸飞机']);
  const obstacle = pick([
    { seen: '一条没有亮灯的小路', try: '把沿路的星灯按顺序点亮', end: '小路变得亮堂堂的' },
    { seen: '一座缺了几块的彩虹桥', try: '把散落的彩虹桥板拼起来', end: '彩虹桥又连在了一起' },
    { seen: '一扇画着图案的小门', try: '把门上的图案放回各自的位置', end: '小门轻轻打开了' },
    { seen: '一张被风吹乱的地图', try: '把地图碎片一块块排好', end: '去往终点的路线出现了' },
  ]);
  const gift = pick(['一块星星饼干', '一朵纸做的小花', '一枚笑脸贴纸', '一条彩虹丝带']);
  const start = `${time}，${hero}坐着${vehicle}，来到${theme.place}。`;
  const goal = `${theme.friend}请它把${theme.object}，送到${theme.destination}。`;
  const problem = `走着走着，它们发现了${obstacle.seen}。`;
  const plan = `${hero}说：“别着急，我们一起想办法。”`;
  const action = `它们仔细观察，${obstacle.try}。`;
  const outcome = `终于，${obstacle.end}，大家开心地向前走。`;
  const delivery = `到了${theme.destination}，${hero}把${theme.object}交给了朋友。`;
  const thanks = `${theme.friend}送来${gift}，说：“谢谢你愿意帮忙！”`;
  const ending = `回家的路上，${hero}想：和朋友一起动脑筋，真快乐！`;
  const lines = n === 4 ? [start, goal, `${problem}${action}${outcome}`, `${delivery}${thanks}`] : n === 6 ? [start, goal, problem, `${plan}${action}`, `${outcome}${delivery}`, `${thanks}${ending}`] : [start, goal, problem, plan, action, outcome, delivery, thanks, ending];
  const rows = lines.map(line => { const chars = Array.from(line); return range(n).map(i => chars.slice(Math.floor(i * chars.length / n), Math.floor((i + 1) * chars.length / n)).join('')); });
  return { title: `${hero}与${theme.object}`, teaser: `目的地：${theme.destination}。每拼好一行，就能读到下一段冒险。`, rows };
}
export function makeGame(level, theme, seed, id, now = new Date().toISOString()) {
  const puzzle = generatePuzzle(level, seed), spec = LEVELS[level];
  return { ...puzzle, id, theme, createdAt: now, updatedAt: now, completedAt: null, story: generateStory(theme, spec.n, seed), cells: puzzle.given.map(value => ({ value, crossed: [], noted: false })), undo: [], hints: 0 };
}
export function act(game, action) {
  if (game.completedAt) return { completed: false, message: '这一页已经拼好了，可以开始新故事' };
  const spec = LEVELS[game.level];
  if (action.type === 'undo') { const prev = game.undo.pop(); if (prev) game.cells = prev; return { completed: false, message: prev ? '已撤销上一步' : '还没有可以撤销的操作' }; }
  const i = action.index;
  if (!Number.isInteger(i) || i < 0 || i >= game.cells.length || game.given[i]) throw new Error('请选择一个可以填写的格子');
  const before = structuredClone(game.cells), cell = game.cells[i];
  if (['cross', 'set'].includes(action.type) && (!Number.isInteger(action.value) || action.value < 1 || action.value > spec.n)) throw new Error('请使用本局图例里的内容');
  let message = '';
  if (action.type === 'set') { cell.value = action.value; message = '已先填上，随时可以回来改'; }
  else if (action.type === 'cross') {
    cell.value = 0; cell.noted = true;
    cell.crossed = cell.crossed.includes(action.value) ? cell.crossed.filter(v => v !== action.value) : [...cell.crossed, action.value].sort((a, b) => a - b);
    const left = range(spec.n).map(v => v + 1).filter(v => !cell.crossed.includes(v));
    if (left.length === 1) { cell.value = left[0]; message = '只剩一种可能，已经帮你填上了！'; }
    else message = left.length ? `还剩 ${left.length} 种可能` : '所有候选都被排除了，点一个叉号把它恢复吧';
  } else if (action.type === 'note') { cell.value = 0; cell.noted = true; message = '先留一个问号，慢慢想'; }
  else if (action.type === 'clear') { cell.value = 0; cell.noted = false; cell.crossed = []; message = '这一格已清空'; }
  else if (action.type === 'hint') {
    const options = choices(game.cells.map(c => c.value), i, spec);
    return { completed: false, hintValues: options, message: options.length ? '可以对照工作台里的提示图案，再想一想。' : '这一格暂时没有可放的内容，检查一下周围已填的格子吧' };
  } else throw new Error('暂时不支持这个操作');
  game.undo.push(before); if (game.undo.length > 200) game.undo.shift();
  const completed = game.cells.every((c, j) => c.value === game.solution[j]);
  return { completed, message };
}
export function publicGame(game) {
  if (!game) return null;
  const { solution, undo, story, ...rest } = game, { n } = LEVELS[game.level];
  const conflicts = game.cells.flatMap((cell, i) => cell.value && peers(i, LEVELS[game.level]).some(j => game.cells[j].value === cell.value) ? [i] : []);
  const rows = story.rows.map((pieces, r) => {
    const current = game.cells.slice(r * n, (r + 1) * n), target = solution.slice(r * n, (r + 1) * n);
    return { complete: current.every((c, i) => c.value === target[i]), pieces: current.map(c => c.value ? pieces[target.indexOf(c.value)] : null) };
  });
  return { ...rest, canUndo: undo.length > 0, conflicts, story: { title: story.title, teaser: story.teaser, rows } };
}
