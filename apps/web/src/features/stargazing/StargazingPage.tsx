import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as DialogKeyboardEvent } from "react";
import { STARS, CONSTELLATIONS, SOURCES } from "./catalog";
import catalogSourceNotes from "./CATALOG_SOURCES.md?raw";
import { SkyCanvas } from "./SkyCanvas";
import { StellarGlobe } from "./StellarGlobe";
import { AllSkyMap } from "./AllSkyMap";
import { colorForStar, constellationView, equatorialToHorizontal, formatRa, localSiderealTime, normalizedSkyView } from "./astronomy";
import { constellationFigureStars, constellationStars, matchesQuery, parseObserverInputs, quantity, SKY_COLLECTIONS, stellarColorLabel } from "./explore";
import { useGameFullscreen } from "../../shared/useGameFullscreen";
import { useGlobalMusicPanel } from "../../shared/audio/music-panel";
import type { Constellation, SkyLayers, SkyObserver, SkyView, Star } from "./types";
import "./stargazing.css";

type Panel = "catalog" | "collections" | "settings" | "sources" | "constellation" | null;
const HOME_VIEW = { ra: 84, dec: 3, fov: 108 };
const SEASONS = { spring: "春夜", summer: "夏夜", autumn: "秋夜", winter: "冬夜", south: "南天" };
const COLLECTION_CATEGORIES = { featured: "精选", seasons: "四季", hemispheres: "南北天空" };
const INITIAL_OBSERVER: SkyObserver = { latitude: 39.9, longitude: 116.4, date: new Date().toISOString() };
const CITY_OPTIONS = [
  { name: "北京", latitude: 39.9, longitude: 116.4 }, { name: "上海", latitude: 31.2, longitude: 121.5 },
  { name: "广州", latitude: 23.1, longitude: 113.3 }, { name: "成都", latitude: 30.6, longitude: 104.1 },
  { name: "拉萨", latitude: 29.7, longitude: 91.1 }, { name: "悉尼", latitude: -33.9, longitude: 151.2 },
];

function Icon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    back: "m14 5-7 7 7 7M7 12h14", search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    globe: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c6 6 6 14 0 20-6-6-6-14 0-20",
    stars: "m3 16 5-11 8 3 5 11M8 5l4 13 4-10M3 16l9 2 9 1",
    layers: "m2 8 10-6 10 6-10 6L2 8m0 5 10 6 10-6m-20 5 10 6 10-6",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    full: "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6", close: "m6 6 12 12M6 18 18 6",
    settings: "M4 7h16M4 17h16M8 4v6m8 4v6", play: "m8 4 12 8-12 8V4", pause: "M8 4v16m8-16v16",
    plus: "M12 5v14M5 12h14", minus: "M5 12h14", book: "M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1m0-16c4-3 8-2 10-1v16c-4-2-7-1-10 1V5",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind] || paths.stars} /></svg>;
}

function MiniConstellation({ constellation }: { constellation: Constellation }) {
  const center = constellation.ra;
  const coords = constellation.lines.flat().map(([ra, dec]) => [((ra - center + 540) % 360 - 180) * Math.cos(constellation.dec * Math.PI / 180), dec] as const);
  const minX = Math.min(...coords.map(p => p[0])), maxX = Math.max(...coords.map(p => p[0]));
  const minY = Math.min(...coords.map(p => p[1])), maxY = Math.max(...coords.map(p => p[1]));
  const scale = 55 / Math.max(maxX - minX, maxY - minY, 1);
  const point = ([ra, dec]: [number, number]) => [36 - (((ra - center + 540) % 360 - 180) * Math.cos(constellation.dec * Math.PI / 180) - (minX + maxX) / 2) * scale, 36 - (dec - (minY + maxY) / 2) * scale];
  return <svg className="sg-mini" viewBox="0 0 72 72" aria-hidden="true">{constellation.lines.map((line, i) => <polyline key={i} points={line.map(p => point(p).join(",")).join(" ")} />)}{constellation.lines.flat().map((p, i) => <circle key={i} cx={point(p)[0]} cy={point(p)[1]} r="1.9" />)}</svg>;
}

function StarButton({ star, onClick }: { star: Star; onClick: () => void }) {
  return <button className="sg-star-row" onClick={onClick} style={{ "--star-color": colorForStar(star) } as CSSProperties}>
    <i aria-hidden="true" /><span><strong>{star.name}</strong><small>{star.latinName || star.spectralType || "恒星"}</small></span><span className="sg-star-mag">{star.magnitude.toFixed(1)} 等<span aria-hidden="true"> ↗</span></span>
  </button>;
}

function containDialogKeys(event: DialogKeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab" && event.key !== "Escape") return;
  event.stopPropagation();
  if (event.key !== "Tab") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary, [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
  const first = items[0], last = items[items.length - 1];
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function localDateInput(date: string) {
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function StargazingPage({ homeHref = "/#nature-title" }: { homeHref?: string } = {}) {
  const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null), restoreButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const full = useGameFullscreen(root);
  const openMusicPanel = useGlobalMusicPanel();
  const [view, setView] = useState<SkyView>(HOME_VIEW);
  const [layers, setLayers] = useState<SkyLayers>({ lines: true, labels: true, grid: false, milkyWay: true, horizon: false });
  const [selectedIds, setSelectedIds] = useState<string[]>([]), [selectedId, setSelectedId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null), [atlas, setAtlas] = useState(false);
  const [settledStar, setStar] = useState<Star | null>(null), [details, setDetails] = useState(true), [paused, setPaused] = useState(false);
  const [flightStar, setFlightStar] = useState<Star | null>(null);
  const star = flightStar || settledStar;
  const [solo, setSolo] = useState(true);
  const [collectionCategory, setCollectionCategory] = useState<keyof typeof COLLECTION_CATEGORIES>("featured");
  const [panel, setPanel] = useState<Panel>(null), [query, setQuery] = useState(""), [tab, setTab] = useState<"constellations" | "stars">("constellations");
  const [visibleStars, setVisibleStars] = useState(80);
  const [filter, setFilter] = useState("all"), [sort, setSort] = useState("familiar");
  const [hidden, setHidden] = useState(false), [touring, setTouring] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [observer, setObserver] = useState(INITIAL_OBSERVER), [place, setPlace] = useState("北京");
  const [latitude, setLatitude] = useState("39.9"), [longitude, setLongitude] = useState("116.4"), [date, setDate] = useState(localDateInput(INITIAL_OBSERVER.date));
  const [formError, setFormError] = useState(""), [notice, setNotice] = useState("");
  const constellation = CONSTELLATIONS.find(c => c.id === selectedId);
  const collection = SKY_COLLECTIONS.find(c => c.id === collectionId);
  const members = useMemo(() => constellation ? constellationStars(constellation, STARS) : [], [constellation]);
  const figureStars = useMemo(() => constellation ? constellationFigureStars(constellation, STARS) : [], [constellation]);
  const collectionConstellations = useMemo(() => collection ? CONSTELLATIONS.filter(c => collection.ids.includes(c.id)) : CONSTELLATIONS, [collection]);
  const collectionStars = useMemo(() => collection ? [...new Map(collectionConstellations.flatMap(c => constellationFigureStars(c, STARS)).map(s => [s.id, s])).values()] : STARS, [collection, collectionConstellations]);
  const isolated = !!constellation && solo;
  const visibleSkyStars = isolated ? figureStars : collection && !constellation ? collectionStars : STARS;
  const visibleLayers = isolated ? { ...layers, milkyWay: false, grid: false, horizon: false } : layers;
  const brightStars = useMemo(() => [...STARS].sort((a, b) => a.magnitude - b.magnitude), []);
  const constellationResults = useMemo(() => CONSTELLATIONS.filter(c => matchesQuery(c, query)
    && (filter === "all" || filter === "zodiac" && (c.zodiac || c.id === "Oph") || c.season === filter))
    .sort((a, b) => sort === "area" ? b.area - a.area : sort === "name" ? a.latinName.localeCompare(b.latinName) : a.rank - b.rank), [query, filter, sort]);
  const starResults = useMemo(() => brightStars.filter(s => matchesQuery(s, query)), [query, brightStars]);
  useEffect(() => setVisibleStars(80), [query]);
  const closePanel = () => { dialog.current?.close(); setPanel(null); opener.current?.focus(); };
  const openPanel = (value: Panel) => {
    if (flightStar) { setStar(flightStar); setFlightStar(null); }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanel(value); setTouring(false);
  };
  const selectConstellation = (id: string, keepCollection = false) => {
    const c = CONSTELLATIONS.find(item => item.id === id);
    if (!c) return;
    setSelectedId(id); setSelectedIds([id]); setStar(null); setFlightStar(null); setAtlas(false); setTouring(false); setSolo(true);
    setView(constellationView(c)); setLayers(v => ({ ...v, labels: true, horizon: false }));
    if (!keepCollection) setCollectionId(null);
    closePanel(); setNotice(`正在看${c.name}`);
  };
  const selectStar = (value: Star) => {
    setStar(reducedMotion ? value : null); setFlightStar(reducedMotion ? null : value);
    setAtlas(false); setDetails(true); setPaused(false); setTouring(false); closePanel(); setNotice(`走近${value.name}`);
  };
  const selectCollection = (id: string) => {
    const c = SKY_COLLECTIONS.find(item => item.id === id);
    if (!c) return;
    setCollectionId(id); setSelectedId(null); setSelectedIds(c.ids); setStar(null); setFlightStar(null); setAtlas(!!c.atlas); setView(c.view); setTouring(false);
    setLayers(v => ({ ...v, lines: true, labels: true, horizon: false })); closePanel();
  };
  const resetSky = () => {
    setSelectedId(null); setSelectedIds([]); setCollectionId(null); setStar(null); setFlightStar(null); setAtlas(false); setView(HOME_VIEW); setTouring(false);
  };
  const returnToSky = () => { setStar(null); setFlightStar(null); setAtlas(false); };
  const toggleAtlas = () => {
    if (atlas) { setAtlas(false); return; }
    resetSky(); setAtlas(true);
  };
  const toggleLayer = (key: keyof SkyLayers) => setLayers(value => ({ ...value, [key]: !value[key] }));
  const moveInCollection = (step: number) => {
    const ids = collection?.ids || CONSTELLATIONS.slice().sort((a, b) => a.rank - b.rank).map(c => c.id);
    const current = selectedId ? ids.indexOf(selectedId) : -1;
    selectConstellation(ids[(current + step + ids.length) % ids.length], !!collection);
  };

  useEffect(() => {
    if (!flightStar) return;
    if (reducedMotion) { setStar(flightStar); setFlightStar(null); return; }
    const timer = window.setTimeout(() => { setStar(flightStar); setFlightStar(null); }, 800);
    return () => window.clearTimeout(timer);
  }, [flightStar, reducedMotion]);
  useEffect(() => {
    const oldTitle = document.title, oldOverflow = document.body.style.overflow;
    document.title = "仰望星空 · 木木学习岛"; document.body.style.overflow = "hidden";
    return () => { document.title = oldTitle; document.body.style.overflow = oldOverflow; };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReducedMotion(media.matches); if (media.matches) setTouring(false); };
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (panel && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (panel === "catalog") dialog.current?.querySelector("input")?.focus();
  }, [panel]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dialog.current?.open) {
        if (hidden) setHidden(false); else if (star) { setStar(null); setFlightStar(null); } else if (atlas) setAtlas(false);
      }
      if (e.target instanceof HTMLElement && (e.target.closest("input,select,textarea,dialog") || e.ctrlKey || e.metaKey || e.altKey)) return;
      if (e.key.toLowerCase() === "h") { e.preventDefault(); setHidden(v => !v); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [hidden, star, atlas]);
  useEffect(() => { if (hidden) restoreButton.current?.focus(); }, [hidden]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200); return () => window.clearTimeout(timer);
  }, [notice]);

  const horizontal = star ? equatorialToHorizontal(star.ra, star.dec, observer) : null;
  const panelTitle = panel === "catalog" ? "在星空里找一找" : panel === "collections" ? "一起看一片星空" : panel === "settings" ? "观察设置" : panel === "constellation" ? `${constellation?.name || "星座"}的故事` : "星空的知识来源";
  return <div ref={root} className={`sg-page${hidden ? " sg-ui-hidden" : ""}${star ? " sg-star-mode" : ""}${atlas ? " sg-atlas-mode" : ""}${flightStar ? " sg-star-entering" : ""}${isolated ? " sg-solo-mode" : ""}${constellation ? " sg-constellation-mode" : ""}${collection ? " sg-collection-mode" : ""}`} data-star-transition={flightStar ? "entering" : "idle"} data-skip-startup-greeting>
    {!settledStar && !atlas && <SkyCanvas stars={visibleSkyStars} constellations={CONSTELLATIONS} view={view} onViewChange={setView} layers={hidden ? { ...visibleLayers, labels: false, grid: false } : visibleLayers} selectedConstellationIds={selectedIds} onSelectStar={selectStar} onSelectConstellation={id => selectConstellation(id, !!collection)} observer={observer} reducedMotion={reducedMotion} touring={touring && !panel && !star} flightTarget={flightStar} />}
    {atlas && !star && <AllSkyMap stars={collection ? collectionStars : STARS} constellations={collection ? collectionConstellations : CONSTELLATIONS} layers={hidden ? { ...layers, labels: false, grid: false } : layers} selectedIds={selectedIds} title={collection?.name} onSelect={id => selectConstellation(id, !!collection)} />}
    {star && <div className={`sg-globe-stage${!details || hidden ? " sg-globe-wide" : ""}`}><StellarGlobe star={star} reducedMotion={reducedMotion} paused={paused || !!panel} /></div>}
    <div className="sg-vignette" aria-hidden="true" />
    {!hidden && <>
      <header className="sg-header">
        <div className="sg-brand-group">
          {star || atlas ? <button className="sg-button sg-back" onClick={returnToSky}><Icon kind="back" /><span>返回星图</span></button>
            : <a className="sg-button sg-back" href={homeHref}><Icon kind="back" /><span>自然</span></a>}
          <div className="sg-brand"><span className="sg-brand-symbol" aria-hidden="true">✧</span><div><strong>仰望星空</strong><small>LOOK UP, WONDER MORE</small></div></div>
        </div>
        <div className="sg-header-actions">
          <button className="sg-button sg-search-button" aria-label="寻找星座与恒星" onClick={() => openPanel("catalog")}><Icon kind="search" /><span>寻找星座与恒星</span></button>
          <button className="sg-button" onClick={() => setHidden(true)} aria-label="隐藏界面，只看星空"><Icon kind="eye" /><span className="sg-optional-label">隐藏界面</span></button>
        </div>
      </header>

      {!star && !atlas && <div className="sg-sky-caption">
        <span className="sg-overline">{constellation ? `CONSTELLATION / ${constellation.id.toUpperCase()}` : collection ? "A JOURNEY THROUGH THE STARS" : "THE NIGHT IS YOURS"}</span>
        <h1>{constellation?.name || collection?.name || "今夜，仰望星空"}</h1>
        <p>{constellation ? isolated ? `只留下 ${figureStars.length} 颗轮廓星，安静看一看。` : constellation.latinName : collection?.subtitle || "拖动天空，点亮一颗星的故事。"}</p>
        {constellation && <div className="sg-solo-controls" aria-label="星座专属观察">
          <label><input type="checkbox" checked={solo} onChange={e => { setSolo(e.target.checked); setTouring(false); }} />只看这个星座</label>
          <label><input type="checkbox" checked={layers.lines} onChange={() => toggleLayer("lines")} />显示连线</label>
        </div>}
        {constellation && <button className="sg-text-button" aria-label="星座故事与恒星" onClick={() => openPanel("constellation")}>星座故事 <span aria-hidden="true">↗</span></button>}
        {!constellation && !collection && <button className="sg-text-button" onClick={() => selectConstellation("Ori")}>从猎户座开始 <span aria-hidden="true">↗</span></button>}
      </div>}

      {star && <>
        <div className="sg-star-heading" style={{ "--star-color": colorForStar(star) } as CSSProperties}><span className="sg-overline">UP CLOSE / 恒星近景</span><h1>{star.name}</h1><p><i />{star.latinName || "一颗遥远的恒星"} · {stellarColorLabel(star)}</p></div>
        {details && <aside className="sg-star-details" aria-label={`${star.name}的详细资料`}>
          <div className="sg-detail-intro"><span className="sg-overline">每一颗星，都不一样</span><h2>认识{star.name}</h2><p>{star.description.split("。")[0]}。</p></div>
          <dl className="sg-facts">
            <div><dt>表面温度 · 估算</dt><dd>{quantity(star.temperatureK, 0)}<small>{star.temperatureK !== null && " K"}</small></dd></div>
            <div><dt>离我们有多远</dt><dd>{quantity(star.distanceLy)}<small>{star.distanceLy !== null && " 光年"}</small></dd></div>
            <div><dt>半径 · 估算</dt><dd>{quantity(star.radiusSolar)}<small>{star.radiusSolar !== null && " 倍太阳"}</small></dd></div>
            <div><dt>可见光亮度比</dt><dd>{quantity(star.luminositySolar)}<small>{star.luminositySolar !== null && " 倍太阳"}</small></dd></div>
            <div><dt>视星等</dt><dd>{star.magnitude.toFixed(2)}<small> 等</small></dd></div>
            <div><dt>光谱类型</dt><dd>{star.spectralType || "未收录"}</dd></div>
          </dl>
          <div className="sg-size-comparison"><span>和太阳比一比</span><div><i className="sg-sun-dot" /><small>太阳</small><b aria-hidden="true">→</b><i className="sg-compare-star" style={{ width: `${Math.min(84, Math.max(14, 20 * Math.pow(star.radiusSolar || 1, .2)))}px`, height: `${Math.min(84, Math.max(14, 20 * Math.pow(star.radiusSolar || 1, .2)))}px`, background: colorForStar(star) }} /><small>{star.name}</small></div><p>大小压缩展示；半径为教学估计，未做全波段光度修正。</p></div>
          <details className="sg-more-facts"><summary>坐标、自转与数据来源</summary><dl>
            <div><dt>赤经 · J2000</dt><dd>{formatRa(star.ra)}</dd></div><div><dt>赤纬 · J2000</dt><dd>{star.dec.toFixed(3)}°</dd></div>
            <div><dt>质量</dt><dd>{quantity(star.massSolar)}{star.massSolar !== null && " 倍太阳"}</dd></div>
            <div><dt>赤道自转速度 · 模型</dt><dd>{quantity(star.rotationKmS)}{star.rotationKmS !== null && " km/s"}</dd></div>
            <div><dt>{place} · 高度 / 方位</dt><dd>{horizontal?.altitude.toFixed(1)}° / {horizontal?.azimuth.toFixed(1)}°</dd></div>
          </dl><p>{star.description}</p><p>高度角低于 0° 表示位于地平线下。位置为教学近似；距离与恒星参数可能有较大测量误差。</p><p>自转参数若有记录，来自相应研究模型；画面转速经过压缩，并非真实计时。</p>{star.sourceUrls.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer">资料来源 {i + 1} ↗</a>)}</details>
          <p className="sg-model-note">颜色参考温度；表面纹理、光晕和转动是示意，并非实拍。未收录的测量不作推断。</p>
        </aside>}
      </>}

      {!star && collection && <nav className="sg-collection-strip" aria-label="这一组星座"><button aria-pressed={!constellation} onClick={() => selectCollection(collection.id)}>查看整组</button>{collection.ids.map(id => {
        const c = CONSTELLATIONS.find(item => item.id === id); return c && <button key={id} aria-pressed={selectedId === id} onClick={() => selectConstellation(id, true)}>{c.name}</button>;
      })}</nav>}
      <div className="sg-bottom">
        <div className="sg-observation-label">{star ? "恒星表面 · 科学示意" : atlas ? `全天 360° · ${collection ? collection.ids.length : CONSTELLATIONS.length} 星座` : isolated ? `${constellation.name} · 专属观察` : `${visibleLayers.horizon ? `${place} · ${new Date(observer.date).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "J2000 星图"} · 视野 ${Math.round(view.fov)}°`}<span>{!star && !atlas ? `${visibleSkyStars.length.toLocaleString()} 颗恒星` : ""}</span></div>
        <nav className="sg-dock" aria-label={star ? "恒星观察工具" : "星空观察工具"}>
          {star ? <>
            <button aria-pressed={details} onClick={() => setDetails(v => !v)}><Icon kind="book" /><span>{details ? "收起资料" : "展开资料"}</span></button>
            <button disabled={reducedMotion} onClick={() => setPaused(v => !v)}><Icon kind={paused || reducedMotion ? "play" : "pause"} /><span>{reducedMotion ? "静态观察" : paused ? "继续转动" : "暂停转动"}</span></button>
            <button onClick={() => { setTab("stars"); setQuery(""); openPanel("catalog"); }}><Icon kind="search" /><span>换一颗星</span></button>
          </> : <>
            <button aria-pressed={atlas} onClick={toggleAtlas}><Icon kind="globe" /><span>{atlas ? "返回漫游" : "全天总览"}</span></button>
            <button aria-pressed={!!collection} onClick={() => openPanel("collections")}><Icon kind="stars" /><span>星座集</span></button>
            <button onClick={() => { setTab("constellations"); openPanel("catalog"); }}><Icon kind="search" /><span>88 星座</span></button>
            <span className="sg-dock-divider" />
            {(!constellation || atlas) && <button aria-pressed={layers.lines} onClick={() => toggleLayer("lines")}><Icon kind="layers" /><span>连线{layers.lines ? "开" : "关"}</span></button>}
            <button onClick={() => openPanel("settings")}><Icon kind="settings" /><span>观察设置</span></button>
          </>}
          <span className="sg-dock-divider" />
          <button disabled={full.switching} aria-pressed={full.focused} onClick={() => void (full.focused ? full.leave() : full.enter())}><Icon kind="full" /><span>{full.focused ? "退出全屏" : "全屏"}</span></button>
        </nav>
        <button className="sg-source-link" onClick={() => openPanel("sources")}>资料与操作</button>
      </div>
      {!star && !atlas && <div className="sg-zoom" aria-label="星图缩放"><button aria-label="放大星图" disabled={view.fov <= 15} onClick={() => setView(v => normalizedSkyView({ ...v, fov: v.fov * .8 }))}><Icon kind="plus" /></button><button aria-label="缩小星图" disabled={view.fov >= 160} onClick={() => setView(v => normalizedSkyView({ ...v, fov: v.fov / .8 }))}><Icon kind="minus" /></button></div>}
      {!star && constellation && <div className="sg-next"><button onClick={() => moveInCollection(-1)} aria-label="上一个星座">←</button><span>{collection ? `${collection.ids.indexOf(constellation.id) + 1} / ${collection.ids.length}` : `推荐 ${constellation.rank} / 88`}</span><button onClick={() => moveInCollection(1)} aria-label="下一个星座">→</button></div>}
    </>}
    {hidden && <button ref={restoreButton} className="sg-button sg-restore" onClick={() => setHidden(false)}><Icon kind="eye" />显示界面</button>}
    <span className="sg-sr-only" aria-live="polite">{notice}</span>

    <dialog ref={dialog} className={`sg-dialog${panel === "catalog" ? " sg-dialog-catalog" : ""}`} aria-labelledby="sg-panel-title" onKeyDown={containDialogKeys} onCancel={() => { setPanel(null); opener.current?.focus(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePanel(); } }}>
      <div className="sg-dialog-header"><div><span className="sg-overline">仰望星空 / EXPLORE</span><h2 id="sg-panel-title">{panelTitle}</h2></div><button className="sg-button" onClick={closePanel} aria-label="关闭面板"><Icon kind="close" />关闭</button></div>
      {panel === "catalog" && <>
        <label className="sg-search-field"><Icon kind="search" /><input autoFocus type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="猎户座、天狼星、Orion…" aria-label="搜索星座或恒星" />{query && <button onClick={() => setQuery("")} aria-label="清空搜索">×</button>}</label>
        <div className="sg-tabs"><button aria-pressed={tab === "constellations"} onClick={() => setTab("constellations")}>星座 {CONSTELLATIONS.length}</button><button aria-pressed={tab === "stars"} onClick={() => setTab("stars")}>恒星 {STARS.length.toLocaleString()}</button></div>
        {tab === "constellations" ? <>
          <div className="sg-filter-row"><label>星空 <select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部星座</option>{Object.entries(SEASONS).map(([key, value]) => <option value={key} key={key}>{value}</option>)}<option value="zodiac">黄道十三星座</option></select></label><label>排序 <select value={sort} onChange={e => setSort(e.target.value)}><option value="familiar">知名度 · 入门推荐</option><option value="area">天区面积</option><option value="name">拉丁名字 A—Z</option></select></label></div>
          <p className="sg-list-note">{sort === "familiar" ? "从耳熟能详的星座开始。本站编排的认识顺序，不是官方知名度调查。" : sort === "area" ? "按星座天区的近似面积排列，面积以平方度计。" : "按照国际通用拉丁名称排列。"}季节以北半球中纬度晚间为参考。</p>
          <div className="sg-constellation-list">{constellationResults.map(c => <button key={c.id} className="sg-constellation-card" onClick={() => selectConstellation(c.id)}><span className="sg-rank">{sort === "area" ? `${Math.round(c.area)}°²` : String(c.rank).padStart(2, "0")}</span><MiniConstellation constellation={c} /><span><strong>{c.name}</strong><small>{c.latinName}</small></span><span className="sg-season">{SEASONS[c.season]}<b aria-hidden="true">↗</b></span></button>)}</div>
          {!constellationResults.length && <div className="sg-empty"><p>这片天空里还没有找到“{query}”。</p><button onClick={() => { setQuery(""); setFilter("all"); }}>看看全部星座</button></div>}
        </> : <>
          {constellation && !query && members.length > 0 && <div className="sg-member-list"><h3>{constellation.name}的亮星</h3>{members.slice(0, 9).map(s => <StarButton key={s.id} star={s} onClick={() => selectStar(s)} />)}</div>}
          <p className="sg-list-note">{query ? `找到 ${starResults.length} 颗恒星` : "全天亮星 · 数字越小，地球上看起来越亮。搜索可以找到星表中的全部恒星。"}</p>
          {starResults.slice(0, visibleStars).map(s => <StarButton key={s.id} star={s} onClick={() => selectStar(s)} />)}
          {starResults.length > visibleStars && <button className="sg-wide-button" onClick={() => setVisibleStars(n => n + 80)}>再看 80 颗 · 已展示 {visibleStars} / {starResults.length}</button>}
          {!starResults.length && <div className="sg-empty"><p>暂时没有找到这颗星，试试中文名、英文名或 HIP 编号。</p><button onClick={() => setQuery("")}>看看亮星</button></div>}
        </>}
      </>}
      {panel === "constellation" && constellation && <div className="sg-constellation-story">
        <div className="sg-story-heading"><MiniConstellation constellation={constellation} /><div><h3>{constellation.latinName}</h3><p>{constellation.description}</p></div></div>
        <dl className="sg-facts"><div><dt>天区面积 · 近似</dt><dd>{quantity(constellation.area)}<small>平方度</small></dd></div><div><dt>认识顺序 · 本站推荐</dt><dd>{constellation.rank}<small> / 88 座</small></dd></div></dl>
        <p className="sg-list-note">{SEASONS[constellation.season]}星空参考 · 季节以北半球中纬度晚间为参考，不代表此刻可见。连线是帮助辨认的图案，恒星之间并没有真的连线。</p>
        <h3>点一颗恒星，走近看看</h3>{members.slice(0, 20).map(s => <StarButton key={s.id} star={s} onClick={() => selectStar(s)} />)}
        {!members.length && <p className="sg-list-note">这个星座暂未收录可展示的亮星。</p>}
        {constellation.sourceUrls.map((url, i) => <a className="sg-story-source" key={url} href={url} target="_blank" rel="noreferrer">星座资料来源 {i + 1} ↗</a>)}
      </div>}
      {panel === "collections" && <>
        <p className="sg-list-note">一组一组地认识天空。看整组，也可以点一座，安静地观察。</p>
        <div className="sg-tabs sg-collection-tabs" aria-label="星座集分类">{Object.entries(COLLECTION_CATEGORIES).map(([key, name]) => <button key={key} aria-pressed={collectionCategory === key} onClick={() => setCollectionCategory(key as keyof typeof COLLECTION_CATEGORIES)}>{name}</button>)}</div>
        <div className="sg-collection-list">{SKY_COLLECTIONS.filter(c => c.category === collectionCategory).map((c, i) => <button key={c.id} onClick={() => selectCollection(c.id)}><span className="sg-collection-number">{String(i + 1).padStart(2, "0")}</span><span><strong>{c.name}</strong><small>{c.subtitle}</small></span><span>{c.ids.length} 座 ↗</span></button>)}</div>
        {collectionCategory === "featured" && <p className="sg-list-note">“最出名”为本站入门精选。传统十二星座之外，天文学黄道还经过蛇夫座。</p>}
        <button className="sg-wide-button" onClick={() => { resetSky(); closePanel(); }}>回到自由漫游</button>
      </>}
      {panel === "settings" && <>
        {openMusicPanel && <button className="sg-toggle" onClick={openMusicPanel}><span><strong>背景音乐</strong><small>选择音乐、调整音量或静音</small></span><b>打开 ↗</b></button>}
        {isolated && <p className="sg-list-note">专属观察隐藏其他星星、银河与网格。关闭“只看这个星座”，就能恢复完整天空。</p>}
        <h3>给天空留多少线索</h3><div className="sg-layer-list">{([["lines", "星座连线", "沿着亮星认识轮廓"], ["labels", "名字标签", "显示星座与明亮恒星的名字"], ["milkyWay", "银河", "真实银道方向上的柔和示意"], ["grid", "坐标网格", "赤经与赤纬，就像天空的经纬线"], ["horizon", "地平线", "区分所选地点地面上下的星空"]] as const).map(([key, name, caption]) => <button key={key} className="sg-toggle" aria-pressed={layers[key]} onClick={() => toggleLayer(key)}><span><strong>{name}</strong><small>{caption}</small></span><b>{layers[key] ? "✓ 开" : "关"}</b></button>)}</div>
        <button className="sg-toggle" disabled={reducedMotion || atlas || !!star} aria-pressed={touring} onClick={() => setTouring(v => !v)}><span><strong>缓缓巡视</strong><small>{reducedMotion ? "系统已选择减少动态效果" : "让星空缓缓经过眼前"}</small></span><b>{touring ? "✓ 开" : "关"}</b></button>
        <h3>换个地点与时间</h3><p className="sg-list-note">自由星图不受昼夜遮挡。这里影响地平线和恒星的高度、方位；日期时间采用本机时区。</p>
        <div className="sg-cities">{CITY_OPTIONS.map(city => <button key={city.name} onClick={() => { setLatitude(String(city.latitude)); setLongitude(String(city.longitude)); }}>{city.name}</button>)}</div>
        <form onSubmit={e => {
          e.preventDefault(); const parsed = parseObserverInputs(latitude, longitude, date);
          if (!parsed) { setFormError("纬度请填 −90～90，经度 −180～180，时间请选择 1900～2100 年内的有效日期。"); return; }
          setObserver(parsed); setSelectedId(null); setSelectedIds([]); setCollectionId(null); setAtlas(false); setStar(null); setFlightStar(null); setView({ ra: localSiderealTime(parsed), dec: parsed.latitude, fov: 160 }); setPlace(CITY_OPTIONS.find(c => c.latitude === parsed.latitude && c.longitude === parsed.longitude)?.name || "自选地点"); setFormError(""); setLayers(v => ({ ...v, horizon: true })); closePanel(); setNotice("已更新观察地点与时间，并显示地平线");
        }}>
          <div className="sg-coordinate-fields"><label>纬度<input type="number" step="any" min="-90" max="90" required value={latitude} onChange={e => setLatitude(e.target.value)} /></label><label>经度<input type="number" step="any" min="-180" max="180" required value={longitude} onChange={e => setLongitude(e.target.value)} /></label></div>
          <label className="sg-date-field">日期与时间<input type="datetime-local" required min="1900-01-01T00:00" max="2100-12-31T23:59" value={date} onChange={e => setDate(e.target.value)} /></label>
          <div className="sg-time-steps">{[-24, -1, 1, 24].map(hours => <button key={hours} type="button" onClick={() => { const current = new Date(date).getTime(); if (Number.isFinite(current)) setDate(localDateInput(new Date(current + hours * 3600000).toISOString())); }}>{hours < 0 ? "−" : "+"}{Math.abs(hours) === 24 ? "1 天" : "1 小时"}</button>)}</div><div className="sg-form-actions"><button type="button" onClick={() => setDate(localDateInput(new Date().toISOString()))}>此刻</button><button type="submit" className="sg-primary">应用到星空</button></div>{formError && <p role="alert" className="sg-error">{formError}</p>}
        </form>
      </>}
      {panel === "sources" && <div className="sg-source-content"><h3>怎么探索</h3><p>拖动换方向，滚轮或双指缩放。点击一颗星，走近看它的表面。点星座名字，聚焦整座星座。</p><p>键盘：方向键移动，+ / − 缩放，H 隐藏界面，Escape 返回。所有星座与恒星也可以从搜索列表打开。</p><h3>真实星空与想象的边界</h3><p>收录 {STARS.length.toLocaleString()} 颗真实恒星与 88 个国际通用星座。星座是天球上的区域；连线只是帮助辨认的图形，不是恒星之间真的连着线。</p><p>星图使用 J2000 坐标与简化地平转换，不模拟大气折射、岁差、天体自行、天气和光污染。银河、恒星表面与自转为科学示意；参数缺失时不补造测量。</p><p>这里聚焦恒星与星座；行星轨道、卫星追踪、实时天气与望远镜控制不在此页中。</p><h3>资料与许可</h3><article><a href="https://science.nasa.gov/solar-system/what-are-asterisms/" target="_blank" rel="noreferrer">NASA · 冬、夏三角与星群 ↗</a><p>亮星三角组对应六颗亮星所在的六个星座；星群与正式星座有不同含义。</p></article><article><a href="https://www.rmg.co.uk/stories/space-astronomy/astronomy/night-sky-highlights-july-2026" target="_blank" rel="noreferrer">格林尼治皇家天文台 · 黄道与蛇夫座 ↗</a><p>传统十二星座和天文学黄道经过的十三星座分别成组，避免混淆。</p></article>{SOURCES.map(source => <article key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><p>{source.note}</p></article>)}<article><a href="https://stellarium.org/" target="_blank" rel="noreferrer">Stellarium ↗</a><p>交互能力参考：全天漫游、目标搜索、星座图层、地点与时间。</p></article><article><a href="https://twtapp.com/" target="_blank" rel="noreferrer">天文通 ↗</a><p>参考星图与按需展开观察工具的组织方式。</p></article><p>星表数据保留 HYG 的 CC BY-SA 4.0 许可与署名；星座图形保留 d3-celestial 的 BSD 许可。详细出处随功能一同提供。</p><details className="sg-license"><summary>完整来源与许可</summary><pre>{catalogSourceNotes}</pre></details></div>}
    </dialog>
  </div>;
}
