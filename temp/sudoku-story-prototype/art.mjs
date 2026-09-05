const themeIds = new Set(['gems', 'elements', 'numbers', 'letters', 'crew']);
const gemNames = ['水滴晶', '菱形晶', '六角晶', '三角晶', '八角晶', '梯形晶', '星星晶', '风筝晶', '方形晶'];
const crewNames = ['阿蓝', '朵朵', '阳阳', '芽芽', '阿紫', '桃桃', '小灰', '月月', '星星'];
const elementNames = ['氢 H', '氦 He', '锂 Li', '铍 Be', '硼 B', '碳 C', '氮 N', '氧 O', '氟 F'];
export function symbolLabel(theme, value) {
  if (!themeIds.has(theme) || !Number.isInteger(value) || value < 1 || value > 9) return '未知图案';
  if (theme === 'elements') return elementNames[value - 1];
  if (theme === 'letters') return String.fromCharCode(64 + value);
  if (theme === 'gems') return gemNames[value - 1];
  if (theme === 'crew') return crewNames[value - 1];
  return String(value);
}
export function symbol(theme, value) {
  if (!themeIds.has(theme) || !Number.isInteger(value) || value < 1 || value > 9) return '';
  return `<img class="symbol" src="/assets/v2/icons/${theme}/symbol-${String(value).padStart(2, '0')}.png" alt="" aria-hidden="true" draggable="false" data-symbol-label="${symbolLabel(theme, value)}" width="256" height="256">`;
}
export function candidateNotes(theme, values, size) {
  const shown = values.slice(0, size === 9 ? 3 : 4);
  return `<span class="question" aria-hidden="true">?</span><span class="notes" aria-hidden="true">${shown.map(value => `<span class="note-icon">${symbol(theme, value)}</span>`).join('')}${values.length > shown.length ? '<span class="notes-more">…</span>' : ''}${!values.length ? '<span class="notes-empty">请恢复</span>' : ''}</span>`;
}
export function scene(theme, seed = 0) {
  if (!themeIds.has(theme)) return '';
  return `<img class="scene-art" src="/assets/v2/backgrounds/${theme}.png" alt="" aria-hidden="true" draggable="false" style="object-position:${50 + ((seed >>> 0) % 11) - 5}% center">`;
}
