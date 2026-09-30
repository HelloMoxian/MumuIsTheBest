import { useEffect, useMemo, useRef, useState } from "react";
import { GameTopBar } from "../../shared/GameTopBar";
import { GEOGRAPHY_PAGES, type GeographyId } from "./catalog";
import { GeographyMap, type MapHandle } from "./GeographyMap";
import { FootprintBook } from "./FootprintBook";
import { api, CORE_LANGUAGES, coreLanguageRegions, selectedRegionIds, pointTitle, normalizeWorldLabels, usesTerrain, EMPTY, jsonRequest, shouldDrill, visibleFeatures, WORLD_LAYERS, type Collection, type Footprint, type GeographyState, type MapFeature, type MapInfo, type WorldLayer } from "./model";
import { countryCities, countryProfile, countryRegions, cityFeature } from "./countries";
import { CountryCard } from "./CountryCard";
import { ELEVATION_STOPS, ELEVATION_GRADIENT, ELEVATION_LEGEND, passFeature, type TerrainInfo } from "./elevation";
import terrainCredits from "../../../../../content/nature/maps/terrain-attribution.v1.json";
import { mineralSites, mineralZoneFocus } from "./mineral-sites";
import { MineralControls, MineralSiteCard } from "./MineralControls";
import { ClimateControls } from "./ClimateControls";
import { toggleClimateGroup } from "./climate";
import { MAP_COLORS, CLIMATE_COLORS } from "./model";
import "./geography.css";

export function GeographyPage({ pageId }: { pageId: GeographyId }) {
  const page = GEOGRAPHY_PAGES.find(item => item.id === pageId)!;
  const world = pageId === "world", footprints = pageId === "footprints";
  const map = useRef<MapHandle | null>(null);
  const sidebar = useRef<HTMLElement | null>(null);
  const [layer, setLayer] = useState<WorldLayer>("countries");
  const [mountainScope, setMountainScope] = useState<"world" | "china">("world");
  const chinaMountains = world && layer === "mountains" && mountainScope === "china";
  const [mineralTypes, setMineralTypes] = useState<string[]>(["oil", "gas", "coal"]);
  const [showMineralPoints, setShowMineralPoints] = useState(true);
  const [showPeaks, setShowPeaks] = useState(true);
  const [climateTypes, setClimateTypes] = useState<string[]>([]);
  const [chinaTerrain, setChinaTerrain] = useState<TerrainInfo | null>(null);
  const [terrainRetry, setTerrainRetry] = useState(0);
  const [path, setPath] = useState<{ id: string; name: string; feature?: MapFeature }[]>([{ id: "100000", name: "全国" }]);
  const parent = path[path.length - 1];
  const [land, setLand] = useState<Collection>(EMPTY), [data, setData] = useState<Collection>(EMPTY);
  const [info, setInfo] = useState<MapInfo | null>(null), [state, setState] = useState<GeographyState | null>(null);
  const [selected, setSelected] = useState<MapFeature | null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const cities = useMemo(() => world && layer === "countries" ? countryCities(data) : EMPTY, [data, world, layer]);
  const profile = world && layer === "countries" ? countryProfile(selected) : null;
  useEffect(() => { if (profile || selected?.properties.kind === "resource-site") sidebar.current?.scrollTo({ top: 0 }); }, [selected?.properties.id]);
  const [search, setSearch] = useState(""), [listLimit, setListLimit] = useState(30);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [mapError, setMapError] = useState(""), [stateError, setStateError] = useState(""), [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const [drafting, setDrafting] = useState(false), [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<[number, number] | null>(null), [visit, setVisit] = useState<Footprint | null>(null);
  const layerInfo = WORLD_LAYERS.find(item => item.id === layer)!;
  const elevationData = useMemo<Collection>(() => world && layer === "elevation" && chinaTerrain?.available
    ? { type: "FeatureCollection", features: [...(chinaTerrain.passes ?? []).map(passFeature), ...data.features] } : data, [data, layer, world, chinaTerrain]);
  const selectedMineralSites = useMemo(() => mineralSites(mineralTypes), [mineralTypes]);
  const exploreData = world && layer === "minerals" ? selectedMineralSites : elevationData;
  useEffect(() => {
    if (world && layer === "minerals") setSelected(current => current ? exploreData.features.find(f => f.properties.id === current.properties.id) ?? null : null);
  }, [world, layer, exploreData]);
  useEffect(() => {
    if (!world) return;
    const controller = new AbortController(); setChinaTerrain(null);
    api<TerrainInfo>("/terrain/china", { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setChinaTerrain(value); })
      .catch(() => { if (!controller.signal.aborted) setChinaTerrain({ available: false, message: "中国精细地形暂时无法加载，仍可查看全球底图。" }); });
    return () => controller.abort();
  }, [world, terrainRetry]);
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
    api<Collection>("/maps/" + (world ? "world/" + ((layer === "languages" || layer === "minerals") ? "countries" : layer === "climate" ? "climatev2" : layer === "continents" ? "continentsv2" : chinaMountains ? "chinamountains" : layer) : "china/" + parent.id), { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { const normalized = world ? normalizeWorldLabels(value) : value; setData(world && layer === "languages" ? coreLanguageRegions(normalized) : world && layer === "countries" ? countryRegions(normalized) : normalized); setLoading(false); drilling.current = false; }
    }).catch(error => { if (!controller.signal.aborted) { setMapError(error.message); setLoading(false); drilling.current = false; } });
    return () => controller.abort();
  }, [world, layer, chinaMountains, parent.id, retry]);
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
  const filtered = visibleFeatures(exploreData, search), selectedId = String(selected?.properties.id ?? "");
  const selectedIds = selectedRegionIds(exploreData, selectedId);
  const lit = !!state?.lights.includes(selectedId);
  return <div className="app-shell geography-shell" data-skip-startup-greeting>
    <GameTopBar title={page.title} backHref="/#subject-nature" backLabel="自然" wallets={false} />
    <main className="geography-main">
      <div className="geo-heading">
        <nav className="geography-nav" aria-label="自然地图玩法">{GEOGRAPHY_PAGES.map(item => <a key={item.id} href={"/nature/" + item.id} aria-current={pageId === item.id ? "page" : undefined}>{item.title}</a>)}</nav>
        <div className="geo-tools" aria-label="地图工具">
          <button onClick={() => map.current?.zoom(1)} aria-label="放大地图">＋ 放大</button>
          <button onClick={() => map.current?.zoom(-1)} aria-label="缩小地图">− 缩小</button>
          <button disabled={drafting} onClick={() => { if (!world) setPath([{ id: "100000", name: "全国" }]); if (chinaMountains) map.current?.china(); else map.current?.home(); }}>查看全貌</button>
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
      {world && layer === "mountains" && <div className="geo-layers" role="group" aria-label="山脉地图范围">
        {([['world', '世界山脉'], ['china', '中国山脉']] as const).map(([scope, name]) => <button key={scope} aria-pressed={mountainScope === scope} onClick={() => { setMountainScope(scope); if (scope === 'china') map.current?.china(); else map.current?.home(); }}>{mountainScope === scope ? '✓ ' : ''}{name}</button>)}
      </div>}
      {(mapError || stateError) && <div className="geo-feedback is-error" role="alert"><p>{mapError || stateError}</p><button onClick={() => setRetry(n => n + 1)}>重试</button></div>}
      <div className="geo-workspace">
        <section className="geo-map-panel" aria-label={world ? "世界地图" : "中国地图"}>
          <GeographyMap mineralContext={world && layer === "minerals" ? data : EMPTY} chinaMountains={chinaMountains} onTerrainError={() => setChinaTerrain({ available: false, message: "精细地形暂时无法读取，已恢复全球底图。" })} chinaTerrain={chinaTerrain} hidePoints={world && ((layer === "elevation" && !showPeaks) || (layer === "minerals" && !showMineralPoints))} world={world} terrain={world && (usesTerrain(layer) || chinaMountains)} marine={world && layer === "oceans"} land={land} data={world && layer === "elevation" && !showPeaks ? EMPTY : exploreData} cities={cities} selectedCity={selectedCity} onCity={city => { const country = data.features.find(f => f.properties.id === city.properties.countryId); if (country) { setSelected(country); setSelectedCity(String(city.properties.id)); setMessage(""); } }} lights={state?.lights ?? []} selected={selectedId}
            footprints={footprints ? state?.footprints ?? [] : []} picked={picked} picking={picking} handle={map}
            highlighted={world && layer === "climate" ? climateTypes : undefined}
            onSelect={feature => { setSelectedCity(""); setSelected(feature); setMessage(""); if (world && layer === "climate") setClimateTypes(ids => toggleClimateGroup(ids, [String(feature.properties.id)])); }} onPick={choosePoint} onVisit={setVisit}
            onZoom={(zoom, feature) => {
              if (world || drafting || loading || drilling.current) return;
              if ((path.length === 2 && zoom < 4.5) || (path.length > 2 && zoom < 6.5)) {
                setPath(p => p.slice(0, -1)); return;
              }
              if (shouldDrill(zoom, path.length) && feature?.properties.children) drill(feature, false);
            }} />
          {loading && <div className="geo-loading" role="status">正在加载{world ? layerInfo.name : parent.name}…</div>}
        </section>
        <aside ref={sidebar} className="geo-sidebar" aria-label="地图探索工具">
          {message && <p className="geo-feedback" role="status">{message}</p>}
          {selected?.properties.kind === "resource-site" && <MineralSiteCard feature={selected} onFocus={() => map.current?.focus(selected)} />}
          {world && !profile && <>
            {layer === "continents" && <div className="geo-language-legend" aria-label="七大洲颜色图例">{data.features.map(feature => <span key={String(feature.properties.id)}><i style={{ background: MAP_COLORS[Number(feature.properties.color)] }} aria-hidden="true" />{feature.properties.name}</span>)}</div>}
            {chinaMountains && <section className="geo-terrain-controls" aria-label="中国山脉快捷定位">
              <h2>中国山脉</h2>
              <div className="geo-pass-list">{data.features.filter(f => Number(f.properties.priority) >= 90).map(feature => <button key={String(feature.properties.id)} onClick={() => { setSelected(feature); map.current?.focus(feature); }}>{feature.properties.name}</button>)}</div>
              {chinaTerrain && !chinaTerrain.available && <p className="geo-hint">精细地形暂不可用，仍可查看山脉范围和全球地形底图。</p>}
            </section>}
            {layer === "climate" && <><div className="geo-legend" aria-label="气候图例">{["热带", "干旱", "温带", "大陆性", "极地"].map((name, i) => <span key={name}><i style={{ background: CLIMATE_COLORS[i] }} />{name}</span>)}</div><ClimateControls data={data} selected={climateTypes} onChange={ids => { setClimateTypes(ids); setSelected(null); }} /></>}
            {layer === "languages" && <div className="geo-language-legend" aria-label="主要语言颜色图例">{CORE_LANGUAGES.map(language => <span key={language.id}><i style={{ background: language.color }} aria-hidden="true" />{language.name}</span>)}<span><i style={{ background: "#617182" }} aria-hidden="true" />其他主要语言</span></div>}
            {layer === "elevation" && <section className="geo-terrain-controls" aria-label="地形显示设置">
              <label className="geo-peak-toggle"><input type="checkbox" checked={showPeaks} onChange={event => setShowPeaks(event.target.checked)} />显示山峰与关口标记</label>
              <div className="geo-height-legend" aria-label={"海拔颜色：" + ELEVATION_LEGEND}>
                <p>海拔颜色 · 米</p>
                <div style={{ background: ELEVATION_GRADIENT }} />
                <ul>{ELEVATION_STOPS.map(stop => <li key={stop.meters}><i style={{ background: stop.color }} aria-hidden="true" />{stop.meters.toLocaleString("zh-CN")}</li>)}</ul>
              </div>
              <h2>中国地形 · 关口</h2>
              {!chinaTerrain ? <p role="status">正在准备精细地形…</p> : chinaTerrain.available ? <>
                <div className="geo-pass-list">{chinaTerrain.passes?.map(pass => <button key={pass.id} onClick={() => { const feature = passFeature(pass); setSelected(feature); map.current?.focus(feature); }}>{pass.name}</button>)}</div>
              </> : <><p role="status">{chinaTerrain.message}</p><button onClick={() => setTerrainRetry(n => n + 1)}>重试精细地形</button></>}
            </section>}
            {layer === "minerals" && <MineralControls selected={mineralTypes} onSelected={setMineralTypes}
              showPoints={showMineralPoints} onShowPoints={setShowMineralPoints} pointCount={selectedMineralSites.features.length}
              onZone={id => { const zone = mineralZoneFocus(id); if (zone) map.current?.focus(zone); }} />}

          </>}
          {footprints && <FootprintBook state={state} onChange={setState} map={map} point={picked} onPoint={choosePoint} onPicking={setPicking} onDraft={setDrafting} visit={visit} onVisit={setVisit} />}
          {profile && selected && <CountryCard profile={profile} onFocus={() => map.current?.focus(selected)} onCity={city => { setSelectedCity(city.id); map.current?.focus(cityFeature(city, String(selected.properties.id))); }} />}
          {selected && selected.properties.kind !== "resource-site" && !profile && !drafting && <section className="geo-selected" aria-label="选中的地方"><h2>{pointTitle(selected)}</h2>
            {selected.properties.detail && <p>{selected.properties.detail}</p>}
            <div className="geo-form-actions"><button onClick={() => map.current?.focus(selected)}>放大看看</button>
              {!world && Number(selected.properties.children) > 0 && <button className="geo-primary" disabled={loading} onClick={() => drill(selected)}>查看下一级</button>}
              {!world && !footprints && <button aria-pressed={lit} disabled={!state || busy} onClick={() => void toggleLight(selected)}>{lit ? "✓ 已点亮" : "点亮这里"}</button>}
            </div>
          </section>}
          {!drafting && !(world && layer === "climate") && <details className="geo-region-details" open={!footprints}><summary>{world ? "找一个地方" : parent.name + " · 地区列表"}</summary>
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
          <details className="geo-source"><summary>地图资料与来源</summary><p>{world && layer === "minerals" ? "精选具名油气田、矿山、盐湖与矿区；未标注不等于没有资源。一个地点只计一次，组合符号表示共伴生矿种。点的大小和数量不表示储量；矿区点不是矿体边界。" : world && layer === "languages" ? "Unicode CLDR 47 的地区语言资料，经教学精选后叠加到国家/地区边界。每地最多两种，包含通用或官方语言，不是语言人口排名。" : world && layer === "elevation" ? "高程设色与山体阴影展示地势；山峰标注来自独立的地名资料。" : info?.description}</p><p>{world && layer === "minerals" ? "油气田采用 Global Energy Monitor GOGET 2026 年 3 月版，部分煤矿采用 GCMT 2026 年 8 月版；按教学用途精选、翻译。其他矿种依据地质机构与运营方资料，位置为所在地概略代表点。各地点可展开查看来源与精度；产量保留原年份，不能作为储量比较。" : world && layer === "languages" ? "Unicode CLDR 47（Unicode-3.0）；Natural Earth 5.1.2（公有领域）。资料年份不完全一致。" : info?.attribution}</p>
            {world && layer === "minerals" && <div className="geo-source-links"><a href="https://globalenergymonitor.org/projects/global-oil-gas-extraction-tracker/" target="_blank" rel="noreferrer">GEM · 全球油气田资料</a><a href="https://globalenergymonitor.org/projects/global-coal-mine-tracker/" target="_blank" rel="noreferrer">GEM · 全球煤矿资料</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">GEM 数据许可 · CC BY 4.0（无担保）</a></div>}

            {world && layer === "climate" && <p>Beck 等（2018），1980–2016 年气候平均分类，1/12° 网格（赤道附近约 9 千米）。相邻同类格网合并为矢量范围，非即时天气；观察视角是对同一套 Köppen 类型的交叉归类，不能将气候类型等同于实际植被边界。</p>}
            {world && layer === "continents" && <p>采用七大洲教学口径。印度尼西亚大部分岛屿属于亚洲；新几内亚岛部分按自然地理归入大洋洲，国家归属不变。俄罗斯等跨洲地区保留洲界，海外岛屿按地理位置着色。</p>}
            {chinaMountains && <><p>山脉范围来自 GMBA Mountain Inventory v2（2022，Standard），为研究划分的山地区域，不是精确山脊线，也不是行政边界。跨境山脉保留完整自然范围。中文名称为教学整理，保留原始名称与编号便于核对。</p><p>Snethlage 等（2022），CC BY 4.0；本图筛选、简化了原始矢量数据。</p><a href="https://doi.org/10.1038/s41597-022-01256-y" target="_blank" rel="noreferrer">GMBA 山脉划分论文</a><a href="https://doi.org/10.48601/earthenv-t9k2-1407" target="_blank" rel="noreferrer">GMBA v2 数据与许可</a></>}
            {world && (layer === "elevation" || chinaMountains) && <><p>新底图由 Mapzen / Tilezen 高程瓦片绘制，来自 USGS 的 SRTM、GMTED2010 与 NOAA ETOPO1。全球使用概览，中国范围更密，精选关口最细；设色和阴影在本机绘制。未安装时回退到增强色彩后的 Natural Earth 地形图片。</p><p>中国概览瓦片约 180—300 米/像素（默认第 9 级）；精选关口周边约 30 米级，继续放大不会增加原始精度。关口标注是坐标附近网格高程，不是实测山口高度；山峰数值沿用 Natural Earth 资料。</p><a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">高程数据来源与许可</a></>}
            <p>{info && "本机数据包：" + info.updatedAt.slice(0, 10)}</p>
            {world && (layer === "elevation" || chinaMountains) && <details><summary>完整高程数据署名</summary>{terrainCredits.credits.map(credit => <p key={credit}>{credit}</p>)}</details>}
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
