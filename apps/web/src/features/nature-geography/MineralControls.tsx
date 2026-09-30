import type { MapFeature } from "./model";
import { MINERAL_GROUPS, MINERAL_RESOURCES } from "./minerals";
import { MINERAL_SITES, MINERAL_ZONES, mineralSymbol } from "./mineral-sites";

function Symbol({ id }: { id: string }) {
  const s = mineralSymbol(id);
  return <svg viewBox="0 0 32 32" width="30" height="30" className="geo-mineral-symbol" aria-hidden="true">
    <path d={s.path} fill={s.color} stroke="#f4f6ff" strokeWidth="1.5" />
    <text x="16" y={s.textY} textAnchor="middle" fill="white" stroke="#10182d" strokeWidth="2" paintOrder="stroke" fontSize="18" fontWeight="800">{s.char}</text>
  </svg>;
}
interface Props {
  selected: string[]; onSelected: (ids: string[]) => void;
  showPoints: boolean; onShowPoints: (show: boolean) => void; pointCount: number;
  onZone: (id: string) => void;
}
export function MineralControls(p: Props) {
  return <section className="geo-mineral-controls" aria-label="矿产资源筛选">
    <label className="geo-peak-toggle"><input type="checkbox" checked={p.showPoints} onChange={e => p.onShowPoints(e.target.checked)} />显示矿产标记</label>
    <p role="status">{p.pointCount} 个精选资源地点</p>
    <div className="geo-form-actions" aria-label="矿产地区快捷定位">{MINERAL_ZONES.map(z => <button key={z.id} onClick={() => p.onZone(z.id)}>{z.name}</button>)}</div>
    <div className="geo-form-actions"><button onClick={() => p.onSelected(MINERAL_RESOURCES.map(r => r.id))}>全选</button><button onClick={() => p.onSelected([])}>清空</button></div>
    {MINERAL_GROUPS.map(group => <fieldset key={group}><legend>{group}</legend><div className="geo-mineral-options">
      {MINERAL_RESOURCES.filter(r => r.group === group).map(resource => <label key={resource.id}>
        <input type="checkbox" checked={p.selected.includes(resource.id)} onChange={event => p.onSelected(event.target.checked ? [...p.selected, resource.id] : p.selected.filter(id => id !== resource.id))} />
        <Symbol id={resource.id} /><span>{resource.name}</span>
      </label>)}
    </div></fieldset>)}
    {!MINERAL_SITES.length && <p role="alert">矿产资料暂时无法读取，请刷新后重试。</p>}
    {!p.selected.length && <p role="status">勾选一种或多种资源。</p>}
  </section>;
}
export function MineralSiteCard({ feature, onFocus }: { feature: MapFeature; onFocus: () => void }) {
  const site = MINERAL_SITES.find(s => s.id === feature.properties.id); if (!site) return null;
  return <section className="geo-selected geo-mineral-fact" aria-label="选中矿产地点的资料">
    <h2>{site.name}</h2><p>{site.region} · {site.kind}</p>
    <div className="geo-mineral-site-resources">{MINERAL_RESOURCES.filter(r => site.resources.includes(r.id)).map(r => <span key={r.id}><Symbol id={r.id} />{r.name}</span>)}</div>
    <p>{site.note}</p>
    <button onClick={onFocus}>放大看看</button>
    <details><summary>位置与资料来源</summary>
      {site.nativeName && <p>{site.nativeName}</p>}
      <p>{site.accuracy}</p><p>{site.coordinateSource}</p><p>{site.asOf} · {site.status}</p>
      <a href={site.source} target="_blank" rel="noreferrer">查看地点资料</a>
    </details>
  </section>;
}
