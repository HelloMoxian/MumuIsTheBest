import { LEVELS, THEMES, range, peers } from './engine.mjs';
import { symbol, symbolLabel, scene, candidateNotes } from './art.mjs';
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = null, selected = null, panelOpen = false, mode = 'cross', busy = false, pending = null, noticeTimer;
let draftLevel = 0, draftTheme = 'gems', rememberedFocus = null;
let hintValues = null;
function notice(message, retry = false) {
  clearTimeout(noticeTimer); $('#status').innerHTML = `${esc(message)}${retry ? '<button id="retry">重试保存</button>' : ''}`;
  if (retry) $('#retry').onclick = () => post(pending);
  else noticeTimer = setTimeout(() => { $('#status').textContent = ''; }, 6500);
}
async function fetchJSON(url, options) { const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); let result; try { result = await response.json(); } catch { throw new Error('暂时连不上探索舱，请检查原型服务是否开启'); } if (!response.ok) { const error = new Error(result.error); error.status = response.status; throw error; } return result; }
async function post(body) {
  if (busy || !body) return;
  if (body.type !== 'hint') hintValues = null;
  busy = true; pending = body; render();
  try {
    state = await fetchJSON('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); pending = null;
    if (body.type === 'new') { selected = null; panelOpen = false; $('#setup').close(); }
    if (body.type === 'hint' && Array.isArray(state.hintValues)) { hintValues = state.hintValues; notice('提示图案已经放在工作台里，可以对照着想一想。'); }
    else notice(state.message);
  } catch(e) {
    if (body.type === 'new') $('#setup').close();
    if (e.status === 409) { try { state = await fetchJSON('/api/state'); pending = null; selected = null; panelOpen = false; notice(e.message); } catch { notice('连接暂时中断，请重试保存', true); } }
    else notice(e.message === 'Failed to fetch' || e.name === 'TimeoutError' ? '连接暂时中断，当前操作已保留，请重试保存' : e.message, true);
  } finally { busy = false; render(); }
}
function send(action) { if (busy || pending) return; return post({ ...action, operationId: crypto.randomUUID(), revision: state.revision, gameId: state.game?.id }); }
function render() {
  if (!state) return;
  rememberedFocus = document.activeElement?.dataset?.focus || rememberedFocus;
  const focusKey = rememberedFocus, scroll = $('.board-scroll')?.scrollLeft || 0;
  const g = state.game, locked = busy || Boolean(pending), disabled = locked ? 'disabled' : '';
  if (!g) { app.innerHTML = '<div class="boot"><h1>星页数独</h1><p>选择一页冒险，开始拼故事。</p><button id="first-start" class="primary">选择新故事</button></div>'; $('#first-start').disabled = locked; $('#first-start').onclick = () => openSetup(); return; }
  const spec = LEVELS[g.level], theme = THEMES.find(t => t.id === g.theme), symbols = range(spec.n).map(i => i + 1);
  const completedRows = g.story.rows.filter(r => r.complete).length, filled = g.cells.filter(c => c.value).length;
  const related = selected === null ? [] : peers(selected, spec), cell = selected === null ? null : g.cells[selected];
  const usable = cell && !g.given[selected] && !g.completedAt, name = selected === null ? '' : `第 ${Math.floor(selected / spec.n) + 1} 行 · 第 ${selected % spec.n + 1} 格`;
  app.innerHTML = `<main class="shell">
    <header class="topbar"><div class="brand"><span class="brandmark" aria-hidden="true">✧</span>木木探索舱 <small> / 星页数独</small></div><div class="balances"><span class="pill"><span class="coin">◉</span> 知识币 <b>${state.wallet.knowledge}</b></span><span class="pill"><span class="energy">ϟ</span> 能量币 <b>${state.wallet.energy}</b></span></div></header>
    <section class="intro"><div><div class="eyebrow">SUDOKU · STORY EXPLORER</div><h1>把星星，拼成故事。</h1><p>填一格，找一条线索。拼一行，读一段冒险。</p></div><div class="actions"><button id="help-open" data-focus="help">怎么玩</button><button id="new-open" data-focus="new" class="primary" ${disabled}>＋ 新的故事</button></div></section>
    ${g.completedAt ? `<section class="success" role="status"><h2>✓ 整本故事拼好啦！</h2><p>本局已获得 ${spec.knowledge} 知识币 + ${spec.energy} 能量币。奖励已保存，下面可以读完整故事。</p><button id="next-story" class="primary" ${disabled}>再去一个新世界</button></section>` : ''}
    <div class="workspace"><section class="panel"><div class="scene">${scene(g.theme, g.seed)}<div><div class="eyebrow">第 ${g.level + 1} 站 · ${spec.name}</div><h2>${theme.name}</h2><p>${theme.tag}</p></div></div><div class="board-inner"><div class="section-head"><strong>${spec.n} × ${spec.n} 探索地图</strong><span class="badge">${spec.clues} 个已知格 · 已填 ${filled} / ${spec.n ** 2}</span></div><div class="board-scroll"><div class="board n${spec.n}" style="--n:${spec.n}" role="group" aria-label="${spec.n} 乘 ${spec.n} 数独棋盘，每行每列每宫不重复">${g.cells.map((c, i) => {
      const r = Math.floor(i / spec.n), col = i % spec.n, left = symbols.filter(v => !c.crossed.includes(v)), conflict = g.conflicts.includes(i);
      const label = `${r + 1} 行 ${col + 1} 列，${c.value ? symbolLabel(g.theme, c.value) : c.noted ? `候选 ${left.map(v => symbolLabel(g.theme, v)).join('、') || '全部排除'}` : '空格'}${g.given[i] ? '，题目固定' : c.value ? '，自己填写' : '，可填写'}${conflict ? '，有重复，请检查' : ''}`;
      return `<button class="cell ${g.given[i] ? 'given' : ''} ${selected === i ? 'selected' : ''} ${related.includes(i) ? 'related' : ''} ${conflict ? 'conflict' : ''} ${!c.value && !c.noted ? 'empty' : ''} ${col % spec.w === spec.w - 1 && col !== spec.n - 1 ? 'block-right' : ''} ${r % spec.h === spec.h - 1 && r !== spec.n - 1 ? 'block-bottom' : ''}" data-index="${i}" data-focus="cell-${i}" aria-label="${esc(label)}" aria-pressed="${selected === i}" ${disabled}>${g.given[i] ? '<span class="given-dot" aria-hidden="true">●</span>' : ''}${c.value ? symbol(g.theme, c.value, g.seed) : c.noted ? candidateNotes(g.theme, left, spec.n) : ''}${conflict ? '<span class="conflict-mark">!</span>' : ''}</button>`;
    }).join('')}</div></div>${spec.n === 9 ? '<p class="mobile-scroll-hint">小屏幕可左右滑动棋盘，或横屏探索</p>' : ''}<div class="legend">${symbols.map(v => `<span class="legend-item" title="${symbolLabel(g.theme, v)}">${symbol(g.theme, v, g.seed)}<span>${symbolLabel(g.theme, v)}</span></span>`).join('')}</div><div class="cell-origins" aria-label="格子来源图例"><span><i class="cell-origin-sample fixed" aria-hidden="true">●</i>题目固定</span><span><i class="cell-origin-sample" aria-hidden="true"></i>自己填写</span></div><p class="rule">每行、每列、每个 ${spec.h} × ${spec.w} 粗框，各种图案只出现一次。<br>金色亮框和 ● 是固定线索；! 提醒你看看重复的格子。</p></div></section>
    <aside class="aside"><section class="panel workbench"><div class="section-head"><div><h2>推理工作台</h2><small>${name || '从一个空格开始'}</small></div>${panelOpen ? '<button class="close-small" id="close-panel" data-focus="close-panel">收起</button>' : ''}</div>
    ${panelOpen && usable ? `<div class="mode-switch"><button data-mode="cross" data-focus="mode-cross" aria-pressed="${mode === 'cross'}" ${disabled}>${mode === 'cross' ? '✓ ' : ''}排除候选</button><button data-mode="set" data-focus="mode-set" aria-pressed="${mode === 'set'}" ${disabled}>${mode === 'set' ? '✓ ' : ''}直接填写</button></div><p>${mode === 'cross' ? '点一下打叉，再点一下恢复。' : '选一个图案，先填进格子里。'}</p><div class="candidate-grid">${symbols.map(v => `<button class="candidate ${mode === 'cross' && cell.crossed.includes(v) ? 'crossed' : ''}" data-value="${v}" data-focus="candidate-${v}" aria-label="${mode === 'cross' ? cell.crossed.includes(v) ? '恢复' : '排除' : '填写'} ${symbolLabel(g.theme, v)}，按 ${v}" ${mode === 'cross' ? `aria-pressed="${cell.crossed.includes(v)}"` : ''} ${disabled}>${symbol(g.theme, v, g.seed)}<span>${mode === 'cross' && cell.crossed.includes(v) ? '点我恢复' : symbolLabel(g.theme, v)}</span></button>`).join('')}</div><div class="actions"><button id="rethink" data-focus="rethink" ${disabled}>重新考虑</button><button id="clear" data-focus="clear" ${disabled}>清空这格</button></div><button id="keep" class="primary wide" data-focus="keep" ${disabled}>${cell.value ? '保留填写，收起' : '保留问号，收起'}</button><button id="hint" class="wide" data-focus="hint" ${disabled}>看看行、列、粗框的提示</button>` : `<div class="empty-bench"><div class="empty-icon" aria-hidden="true">${g.completedAt ? '✧' : '?'}</div><h3>${g.completedAt ? '你拼出了一个新故事' : panelOpen && !usable ? '这是给你的线索' : '这里会留下你的思考'}</h3><p>${g.completedAt ? '读完故事，再开始下一次冒险吧。' : panelOpen && !usable ? '带小圆点的格子不用改，试试旁边的空格。' : '点一个格子，把不可能的图案一个个排除。'}</p>${selected !== null && usable ? `<button id="reopen" class="wide">继续想这一格</button>` : ''}</div>`}
    <button id="undo" data-focus="undo" class="wide" ${disabled || !g.canUndo || g.completedAt ? 'disabled' : ''}>↶ 撤销上一步</button></section><section class="panel reward-card"><h3>这一页的星光奖励</h3><div class="reward-values"><span class="coin"><b>+${spec.knowledge}</b> 知识币</span><span class="energy"><b>+${spec.energy}</b> 能量币</span></div><small>完整拼好后领取 · 不限时 · 不扣币</small><div class="progress" role="progressbar" aria-label="故事完成进度" aria-valuenow="${completedRows}" aria-valuemin="0" aria-valuemax="${spec.n}"><i style="width:${completedRows / spec.n * 100}%"></i></div><p>${completedRows} / ${spec.n} 段故事已拼好</p></section></aside></div>
    <section class="panel storybook"><div class="section-head"><div><div class="eyebrow">YOUR STORY · 正在编织的冒险</div><h2>${esc(g.story.title)}</h2><p class="muted">${esc(g.story.teaser)}</p></div><span class="badge">${g.completedAt ? '✓ 完整故事' : '碎片会跟着填写重新排列'}</span></div>${g.story.rows.map((row, r) => `<div class="story-row ${row.complete ? 'complete' : ''} ${selected !== null && Math.floor(selected / spec.n) === r ? 'active' : ''}"><span class="row-badge">${row.complete ? '✓' : r + 1}</span><div><div class="fragments">${row.pieces.map(piece => `<span class="fragment ${piece === null ? 'missing' : ''}">${piece === null ? '···' : esc(piece)}</span>`).join('')}</div><small>${row.complete ? `第 ${r + 1} 行 · 故事已拼好` : `第 ${r + 1} 行 · ${row.pieces.every(Boolean) ? '碎片还没接好，再检查一下这一行' : '填入图案，让故事连起来'}`}</small></div></div>`).join('')}</section>
    <footer class="footer"><span class="${!locked ? 'saved' : ''}">${busy ? '正在保存……' : pending ? '保存暂停 · 请重试' : '✓ 已自动保存在本机'}</span><span>已完成 ${state.history.length}${state.history.length === 30 ? '+' : ''} 个故事 · 独立试玩钱包，与正式余额分开</span></footer></main>`;
  $('.board-scroll').scrollLeft = scroll;
  $('#new-open').onclick = () => openSetup(); $('#help-open').onclick = () => $('#help').showModal();
  if ($('#next-story')) $('#next-story').onclick = () => openSetup();
  document.querySelectorAll('[data-index]').forEach(button => button.onclick = () => selectCell(Number(button.dataset.index)));
  document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => { mode = button.dataset.mode; render(); });
  document.querySelectorAll('[data-value]').forEach(button => button.onclick = () => send({ type: mode, index: selected, value: Number(button.dataset.value) }));
  if ($('#close-panel')) $('#close-panel').onclick = closePanel;
  if ($('#keep')) $('#keep').onclick = closePanel;
  if ($('#reopen')) $('#reopen').onclick = () => { panelOpen = true; render(); };
  if ($('#clear')) $('#clear').onclick = () => send({ type: 'clear', index: selected });
  if ($('#rethink')) $('#rethink').onclick = () => { mode = 'cross'; send({ type: 'note', index: selected }); };
  if ($('#hint')) $('#hint').onclick = () => send({ type: 'hint', index: selected });
  $('#undo').onclick = () => send({ type: 'undo' });
  renderHint();
  if (focusKey) document.querySelector(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
  if ($('#setup').open) $('#start-new').disabled = locked;
}
async function selectCell(i) { if (busy || pending) return; hintValues = null; selected = i; panelOpen = true; const g = state.game; if (!g.given[i] && !g.cells[i].value && !g.cells[i].noted && !g.completedAt) await send({ type: 'note', index: i }); else render(); document.querySelector(`[data-index="${i}"]`)?.focus({ preventScroll: true }); }
function closePanel() { panelOpen = false; render(); document.querySelector(`[data-index="${selected}"]`)?.focus({ preventScroll: true }); }
function openSetup() { if (busy || pending) return; draftLevel = state?.game?.level ?? 0; draftTheme = state?.game?.theme ?? 'gems'; renderSetup(); $('#setup').showModal(); }
function renderSetup() {
  $('#setup').innerHTML = `<h2 id="setup-title">下一页，去哪里冒险？</h2><p class="muted">每次都有新地图和新故事，六站都可以自由选择。</p><h3>01 · 选择探索难度</h3><div class="level-options">${LEVELS.map((s, i) => `<button class="level-option" data-level="${i}" aria-pressed="${draftLevel === i}"><b>${draftLevel === i ? '✓' : i + 1} ${s.name}</b><small>${s.n} × ${s.n} · ${s.clues} 个已知格</small><small>知识币 +${s.knowledge} · 能量币 +${s.energy}</small></button>`).join('')}</div><h3>02 · 选择故事世界</h3><div class="theme-options">${THEMES.map(t => `<button class="theme-option" data-theme="${t.id}" aria-pressed="${draftTheme === t.id}">${symbol(t.id, 1)}${draftTheme === t.id ? '✓ ' : ''}${t.name}</button>`).join('')}</div>${state?.game && !state.game.completedAt ? '<p class="setup-warning">开始后会替换当前未完成的棋盘。已经获得的奖励会保留。</p>' : ''}<div class="dialog-actions"><button id="cancel-new">返回当前页</button><button id="start-new" class="primary">${state?.game && !state.game.completedAt ? '放下本局，开始新故事' : '开始新故事'}</button></div>`;
  document.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { draftLevel = Number(b.dataset.level); renderSetup(); document.querySelector(`[data-level="${draftLevel}"]`).focus(); });
  document.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { draftTheme = b.dataset.theme; renderSetup(); document.querySelector(`[data-theme="${draftTheme}"]`).focus(); });
  $('#cancel-new').onclick = () => $('#setup').close();
  $('#start-new').onclick = () => { $('#start-new').disabled = true; send({ type: 'new', level: draftLevel, theme: draftTheme }); };
}
$('#close-help').onclick = () => $('#help').close();
$('#setup').addEventListener('cancel', e => { if (busy || pending) e.preventDefault(); });
document.addEventListener('keydown', e => {
  if ($('#setup').open || $('#help').open || busy || pending || !state?.game || e.ctrlKey || e.metaKey || e.altKey || !e.target.closest('.board, .workbench')) return;
  const g = state.game, n = LEVELS[g.level].n;
  if (e.key === 'Escape') { e.preventDefault(); closePanel(); return; }
  if (selected === null) return;
  const arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n };
  if (arrows[e.key]) { e.preventDefault(); const r = Math.floor(selected / n), c = selected % n; if (e.key === 'ArrowLeft' && !c || e.key === 'ArrowRight' && c === n - 1 || e.key === 'ArrowUp' && !r || e.key === 'ArrowDown' && r === n - 1) return; hintValues = null; selected += arrows[e.key]; panelOpen = true; render(); document.querySelector(`[data-index="${selected}"]`).focus(); return; }
  if (g.given[selected] || g.completedAt || !panelOpen) return;
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); send({ type: 'clear', index: selected }); return; }
  const v = /^[1-9]$/.test(e.key) ? Number(e.key) : /^[a-i]$/i.test(e.key) ? e.key.toUpperCase().charCodeAt(0) - 64 : 0;
  if (v && v <= n) { e.preventDefault(); send({ type: mode, index: selected, value: v }); }
});
async function boot() { try { state = await fetchJSON('/api/state'); if (!state.game) await send({ type: 'new', level: 0, theme: 'gems' }); else render(); } catch(e) { app.innerHTML = `<div class="boot"><h1>星页数独</h1><p>${esc(e.message)}</p><button id="retry-load">重新连接</button></div>`; $('#retry-load').onclick = boot; } }
boot();

function renderHint() {
  if (hintValues === null || !panelOpen || !state?.game || !$('#hint')) return;
  const panel = document.createElement('div');
  panel.className = 'hint-pictures';
  panel.setAttribute('role', 'status');
  const names = hintValues.map(v => symbolLabel(state.game.theme, v));
  panel.setAttribute('aria-label', names.length ? '可以考虑：' + names.join('、') : '没有可放的图案，检查周围的填写');
  panel.innerHTML = `<p>${names.length ? '看看这些图案：' : '这一格暂时放不下图案，再检查周围吧。'}</p><div>${hintValues.map(v => symbol(state.game.theme, v)).join('')}</div>${names.length ? '<small>只根据当前的行、列和粗框，仍需要你判断。</small>' : ''}`;
  $('#hint').after(panel);
}

document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if (image.matches('.symbol')) {
    const fallback = document.createElement('span');
    fallback.className = 'symbol image-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = image.dataset.symbolLabel || '图案';
    image.replaceWith(fallback);
  } else if (image.matches('.scene-art')) image.hidden = true;
}, true);
