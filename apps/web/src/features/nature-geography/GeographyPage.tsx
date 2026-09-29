import { useEffect, useMemo, useRef, useState } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { GEOGRAPHY_PAGES, type GeographyId } from "./catalog";
import { GeographyMap, type MapHandle } from "./GeographyMap";
import { FootprintBook } from "./FootprintBook";
import { api, CORE_LANGUAGES, coreLanguageRegions, selectedRegionIds, pointTitle, normalizeWorldLabels, usesTerrain, EMPTY, jsonRequest, shouldDrill, visibleFeatures, WORLD_LAYERS, type Collection, type Footprint, type GeographyState, type MapFeature, type MapInfo, type WorldLayer } from "./model";
import { countryCities, countryProfile, countryRegions, cityFeature } from "./countries";
import { CountryCard } from "./CountryCard";
import "./geography.css";

export function GeographyPage({ pageId }: { pageId: GeographyId }) {
  const page = GEOGRAPHY_PAGES.find(item => item.id === pageId)!;
  const world = pageId === "world", footprints = pageId === "footprints";
  const map = useRef<MapHandle | null>(null);
  const sidebar = useRef<HTMLElement | null>(null);
  const [layer, setLayer] = useState<WorldLayer>("countries");
  const [path, setPath] = useState<{ id: string; name: string; feature?: MapFeature }[]>([{ id: "100000", name: "全国" }]);
  const parent = path[path.length - 1];
  const [land, setLand] = useState<Collection>(EMPTY), [data, setData] = useState<Collection>(EMPTY);
  const [info, setInfo] = useState<MapInfo | null>(null), [state, setState] = useState<GeographyState | null>(null);
  const [selected, setSelected] = useState<MapFeature | null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const cities = useMemo(() => world && layer === "countries" ? countryCities(data) : EMPTY, [data, world, layer]);
  const profile = world && layer === "countries" ? countryProfile(selected) : null;
  useEffect(() => { if (profile) sidebar.current?.scrollTo({ top: 0 }); }, [selected?.properties.id]);
  const [search, setSearch] = useState(""), [listLimit, setListLimit] = useState(30);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [mapError, setMapError] = useState(""), [stateError, setStateError] = useState(""), [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [drafting, setDrafting] = useState(false), [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<[number, number] | null>(null), [visit, setVisit] = useState<Footprint | null>(null);
  const layerInfo = WORLD_LAYERS.find(item => item.id === layer)!;
  const drilling = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setInfo(null); setLand(EMPTY);
    Promise.all([api<MapInfo>("/maps/" + (world ? "world" : "china"), { signal: controller.signal }),
      api<Collection>("/maps/" + (world ? "world/land" : "china/100000"), { signal: controller.signal })])
      .then(([metadata, base]) => { if (!controller.signal.aborted) { setInfo(metadata); setLand(world ? normalizeWorldLabels(base) : base); } })
      .catch(error => { if (!controller.signal.aborted) setMapError(error.message); });
    return () => controller.abort();
  }, [world, retry]);
  useEffect(() => {
    const controller = new AbortController(); setStateError("");
    if (!world) api<GeographyState>("/state", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setState(value); })
      .catch(error => { if (!controller.signal.aborted) { setState(null); setStateError(error.message); } });
    return () => controller.abort();
  }, [world, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setMapError(""); setSelected(null); setSelectedCity(""); setSearch(""); setData(EMPTY); setListLimit(30);
    api<Collection>("/maps/" + (world ? "world/" + (layer === "languages" ? "countries" : layer) : "china/" + parent.id), { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { const normalized = world ? normalizeWorldLabels(value) : value; setData(world && layer === "languages" ? coreLanguageRegions(normalized) : world && layer === "countries" ? countryRegions(normalized) : normalized); setLoading(false); drilling.current = false; }
    }).catch(error => { if (!controller.signal.aborted) { setMapError(error.message); setLoading(false); drilling.current = false; } });
    return () => controller.abort();
  }, [world, layer, parent.id, retry]);
  const drill = (feature: MapFeature, focus = true) => {
    if (world || loading || !feature.properties.children || drafting || drilling.current) return;
    const id = String(feature.properties.id); if (path.some(p => p.id === id)) return;
    drilling.current = true; setPath(p => [...p, { id, name: String(feature.properties.name), feature }]);
    if (focus) map.current?.focus(feature);
  };
  const choosePoint = (point: [number, number] | null) => {
    if (point && (point[0] < 70 || point[0] > 140 || point[1] < 0 || point[1] > 56)) { setMessage("请在中国地图附近选择地点。"); return; }
    setPicked(point); setPicking(false); setMessage("");
  };
  const toggleLight = async (feature: MapFeature) => {
    if (busy || !state) return;
    const id = String(feature.properties.id), lit = !state.lights.includes(id);
    setBusy(true); setMessage("");
    try {
      setState(await api<GeographyState>("/lights/" + id, jsonRequest("PUT", { lit })));
      setMessage((lit ? "已点亮" : "已取消点亮") + feature.properties.name);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  const filtered = visibleFeatures(data, search), selectedId = String(selected?.properties.id ?? "");
  const selectedIds = selectedRegionIds(data, selectedId);
  const lit = !!state?.lights.includes(selectedId);
  return <div className="app-shell geography-shell" data-skip-startup-greeting>
    <GameTopBar title={page.title} backHref="/#subject-nature" backLabel="自然" wallets={false} />
    <main className="geography-main">
      <div className="geo-heading">
        <nav className="geography-nav" aria-label="自然地图玩法">{GEOGRAPHY_PAGES.map(item => <a key={item.id} href={"/nature/" + item.id} aria-current={pageId === item.id ? "page" : undefined}>{item.title}</a>)}</nav>
        <div className="geo-tools" aria-label="地图工具">
          <button onClick={() => map.current?.zoom(1)} aria-label="放大地图">＋ 放大</button>
          <button onClick={() => map.current?.zoom(-1)} aria-label="缩小地图">− 缩小</button>
          <button disabled={drafting} onClick={() => { if (!world) setPath([{ id: "100000", name: "全国" }]); map.current?.home(); }}>查看全貌</button>
        </div>
      </div>
      {world ? <div className="geo-layers" role="group" aria-label="世界图层">{WORLD_LAYERS.map(item =>
        <button key={item.id} aria-pressed={layer === item.id} onClick={() => setLayer(item.id)}>{layer === item.id ? "✓ " : ""}{item.name}</button>)}</div>
        : <nav className="geo-breadcrumbs" aria-label="当前地图范围">{path.map((item, index) =>
          <button key={item.id} aria-current={index === path.length - 1 ? "location" : undefined} disabled={drafting} onClick={() => {
            setPath(path.slice(0, index + 1)); if (index === 0) map.current?.home(); else if (item.feature) map.current?.focus(item.feature);
          }}>{item.name}{index < path.length - 1 ? " ›" : ""}</button>)}
          <span>{footprints ? "放大后看照片" : "已点亮 " + (state?.lights.length ?? 0) + " 个地区"}</span>
        </nav>}
      {(mapError || stateError) && <div className="geo-feedback is-error" role="alert"><p>{mapError || stateError}</p><button onClick={() => setRetry(n => n + 1)}>重试</button></div>}
      <div className="geo-workspace">
        <section className="geo-map-panel" aria-label={world ? "世界地图" : "中国地图"}>
          <GeographyMap world={world} terrain={world && usesTerrain(layer)} marine={world && layer === "oceans"} land={land} data={data} cities={cities} selectedCity={selectedCity} onCity={city => { const country = data.features.find(f => f.properties.id === city.properties.countryId); if (country) { setSelected(country); setSelectedCity(String(city.properties.id)); setMessage(""); } }} lights={state?.lights ?? []} selected={selectedId}
            footprints={footprints ? state?.footprints ?? [] : []} picked={picked} picking={picking} handle={map}
            onSelect={feature => { setSelectedCity(""); setSelected(feature); setMessage(""); }} onPick={choosePoint} onVisit={setVisit}
            onZoom={(zoom, feature) => {
              if (world || drafting || loading || drilling.current) return;
              if ((path.length === 2 && zoom < 4.5) || (path.length > 2 && zoom < 6.5)) {
                setPath(p => p.slice(0, -1)); return;
              }
              if (shouldDrill(zoom, path.length) && feature?.properties.children) drill(feature, false);
            }} />
          {loading && <div className="geo-loading" role="status">正在加载{world ? layerInfo.name : parent.name}…</div>}
          <p className="geo-map-caption">{world ? "拖动探索 · 滚轮或双指缩放 · 点地名查看资料" : "点选地区，再查看下一级 · 放大地图中心也会展开细节"}</p>
        </section>
        <aside ref={sidebar} className="geo-sidebar" aria-label="地图探索工具">
          {!profile && <div className="geo-panel-banner" style={{ backgroundImage: "url(/images/nature/geography/" + pageId + ".webp)" }}><strong>{world ? layerInfo.name : footprints ? "我的旅行相册" : "点亮认识的地方"}</strong></div>}
          {message && <p className="geo-feedback" role="status">{message}</p>}
          {world && !profile && <><p className="geo-hint">{layerInfo.hint}</p>
            {layer === "climate" && <div className="geo-legend" aria-label="气候图例">{["热带", "干旱", "温带", "大陆性", "极地"].map((name, i) => <span key={name}><i className={"climate-" + i} />{name}</span>)}</div>}
            {layer === "languages" && <div className="geo-language-legend" aria-label="主要语言颜色图例">{CORE_LANGUAGES.map(language => <span key={language.id}><i style={{ background: language.color }} aria-hidden="true" />{language.name}</span>)}<span><i style={{ background: "#617182" }} aria-hidden="true" />其他主要语言</span></div>}
            {["minerals", "elevation"].includes(layer) && <p className="geo-hint">紫色圆内是聚合数量；点击查看这一组，再展开或选一个地点。黄色点是单个地点，点击可读资料。</p>}
          </>}
          {!world && !footprints && <p className="geo-hint">勾选一个地区，就能在地图上点亮它。省、市、区县分别记录。</p>}
          {footprints && <FootprintBook state={state} onChange={setState} map={map} point={picked} onPoint={choosePoint} onPicking={setPicking} onDraft={setDrafting} visit={visit} onVisit={setVisit} />}
          {profile && selected && <CountryCard profile={profile} onFocus={() => map.current?.focus(selected)} onCity={city => { setSelectedCity(city.id); map.current?.focus(cityFeature(city, String(selected.properties.id))); }} />}
          {selected && !profile && !drafting && <section className="geo-selected" aria-label="选中的地方"><h2>{pointTitle(selected)}</h2>
            {selected.properties.detail && <p>{selected.properties.detail}</p>}
            <div className="geo-form-actions"><button onClick={() => map.current?.focus(selected)}>放大看看</button>
              {!world && Number(selected.properties.children) > 0 && <button className="geo-primary" disabled={loading} onClick={() => drill(selected)}>查看下一级</button>}
              {!world && !footprints && <button aria-pressed={lit} disabled={!state || busy} onClick={() => void toggleLight(selected)}>{lit ? "✓ 已点亮" : "点亮这里"}</button>}
            </div>
          </section>}
          {!drafting && <details className="geo-region-details" open={!footprints}><summary>{world ? "找一个地方" : parent.name + " · 地区列表"}</summary>
            <label className="geo-search">搜索{world ? "地名或资料" : "当前地区"}<input type="search" value={search} placeholder="输入名称" onChange={e => { setSearch(e.target.value); setListLimit(30); }} /></label>
            {!loading && !filtered.length && <p>这里还没有找到，换个名字试试。</p>}
            <div className="geo-regions">{filtered.slice(0, listLimit).map(feature => {
              const id = String(feature.properties.id), checked = !!state?.lights.includes(id);
              return <div className="geo-region-row" key={id}>
                <button aria-pressed={selectedIds.includes(id)} onClick={() => { setSelectedCity(""); setSelected(feature); setMessage(""); }}>{(checked || (world && selectedIds.includes(id))) && "✓ "}{feature.properties.name}</button>
                {!world && !footprints && <label className="geo-light-check"><input type="checkbox" checked={checked} disabled={!state || busy} onChange={() => void toggleLight(feature)} aria-label={"点亮" + feature.properties.name} /><span>{checked ? "已点亮" : "点亮"}</span></label>}
                {!world && Number(feature.properties.children) > 0 && <button disabled={loading} onClick={() => drill(feature)} aria-label={"进入" + feature.properties.name}>进入</button>}
              </div>;
            })}</div>
            {filtered.length > listLimit && <button className="geo-wide" onClick={() => setListLimit(n => n + 30)}>再看 30 个（共 {filtered.length} 个）</button>}
          </details>}
          <details className="geo-source"><summary>地图资料与来源</summary><p>{world && layer === "languages" ? "Unicode CLDR 47 的地区语言资料，经教学精选后叠加到国家/地区边界。每地最多两种，包含通用或官方语言，不是语言人口排名。" : info?.description}</p><p>{world && layer === "languages" ? "Unicode CLDR 47（Unicode-3.0）；Natural Earth 5.1.2（公有领域）。资料年份不完全一致。" : info?.attribution}</p>
            <p>{info && "本机数据包：" + info.updatedAt.slice(0, 10)}</p>
            <div className="geo-source-links">{world ? <>
              <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth · 公有领域</a>
              <a href="https://github.com/unicode-org/cldr-json/tree/47.0.0/cldr-json/cldr-core/supplemental" target="_blank" rel="noreferrer">Unicode CLDR 47 · 主要语言资料</a>
              <a href="https://doi.org/10.6084/m9.figshare.6396959" target="_blank" rel="noreferrer">Beck 等 · 气候数据</a>
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">气候许可 · CC BY 4.0</a>
              <a href="https://energy.usgs.gov/arcgis/rest/services/Hosted/Mineral_Resource_Data_System/FeatureServer/0" target="_blank" rel="noreferrer">USGS · 历史矿点</a>
            </> : <a href="https://datav.aliyun.com/portal/school/atlas/area_selector" target="_blank" rel="noreferrer">阿里云 DataV GeoAtlas</a>}</div>
            {!!info?.missing.length && <p>有 {info.missing.length} 个地区的细分数据暂未取得，其他地区仍可探索。</p>}
            {!world && <p>地图为行政区划边界，放大不会出现未收录的道路与建筑。数据有其精度范围。</p>}</details>
        </aside>
      </div>
    </main>
  </div>;
}
