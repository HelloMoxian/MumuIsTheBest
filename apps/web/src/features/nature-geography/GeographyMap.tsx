import { useEffect, useMemo, useRef, useState } from "react";
import { Map as LibreMap, Marker, setWorkerUrl, type GeoJSONSource, type ExpressionSpecification } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { canShowPhoto, languageStripe, CORE_LANGUAGES, selectedRegionIds, clusterSummary, pointKindName, pointTitle, featureFocusBounds, featureCenter, featureWeight, photoUrl, type Collection, type Footprint, type MapFeature } from "./model";

import { cityVisible } from "./countries";

export interface MapHandle {
  zoom: (delta: number) => void;
  home: () => void;
  focus: (feature: MapFeature) => void;
  visit: (record: Footprint) => void;
  center: () => [number, number];
}
interface Props {
  world: boolean; terrain: boolean; marine: boolean; land: Collection; data: Collection; lights: string[]; selected: string;
  cities: Collection; selectedCity: string; onCity: (city: MapFeature) => void;
  footprints: Footprint[]; picking: boolean; picked: [number, number] | null;
  handle: React.RefObject<MapHandle | null>;
  onSelect: (feature: MapFeature) => void; onPick: (point: [number, number]) => void;
  onVisit: (record: Footprint) => void; onZoom: (zoom: number, centerFeature: MapFeature | undefined) => void;
}
interface MapDetail {
  title: string; description: string; features?: MapFeature[]; total?: number;
  point?: [number, number]; expansionZoom?: number;
}
const COLORS = ["#8D73FF", "#69DBD1", "#E999BC", "#DCC56C", "#6FB9E8", "#A5CC8B", "#C69DE8"];
const CLIMATE_COLORS = ["#258c86", "#dfb563", "#6daf76", "#6e92c9", "#d2deef"];
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
setWorkerUrl(mapWorkerUrl);

export function GeographyMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const loadedMap = useRef<LibreMap | null>(null);
  const sourceData = useRef(new Map<string, Collection>());
  const regionData = useMemo<Collection>(() => ({ type: "FeatureCollection", features: props.data.features.filter(f => f.geometry.type !== "Point") }), [props.data]);
  const pointData = useMemo<Collection>(() => ({ type: "FeatureCollection", features: props.data.features.filter(f => f.geometry.type === "Point") }), [props.data]);
  const current = useRef(props); current.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const markers = useRef<Marker[]>([]);
  const [detail, setDetail] = useState<MapDetail | null>(null);
  const requestId = useRef(0);
  const openFeature = (feature: MapFeature) => {
    requestId.current += 1;
    setDetail(feature.properties.kind === "countries" ? null : { title: pointTitle(feature), description: String(feature.properties.detail || "选择“放大看看”查看这个地方。") });
    current.current.onSelect(feature);
  };
  const openCluster = useRef<(id: number, point: [number, number], count: number) => void>(() => undefined);
  useEffect(() => { requestId.current += 1; setDetail(null); }, [props.data]);
  useEffect(() => {
    const feature = props.data.features.find(f => f.properties.id === props.selected);
    if (feature) setDetail(feature.properties.kind === "countries" ? null : { title: pointTitle(feature), description: String(feature.properties.detail || "选择“放大看看”查看这个地方。") });
  }, [props.selected, props.data]);
  const refreshMarkers = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!container.current) return;
    let map: LibreMap;
    try {
      map = new LibreMap({ container: container.current, center: props.world ? [12, 18] : [104, 34], zoom: props.world ? 1.2 : 3,
        minZoom: props.world ? 0.4 : 2, maxZoom: props.world ? 10 : 16, renderWorldCopies: false,
        attributionControl: false, dragRotate: false, pitchWithRotate: false,
        style: { version: 8, sources: {}, layers: [{ id: "sea", type: "background", paint: { "background-color": "#152c4b" } }] },
      });
    } catch { setError("地图暂时无法绘制。请开启浏览器图形加速后重试，仍可使用右侧地区列表。"); return; }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.getCanvas().setAttribute("aria-label", "可缩放地图，方向键移动，加减键缩放，也可使用地区列表");
    const moveDuration = () => reducedMotion() ? 0 : 450;
    const focus = (feature: MapFeature) => {
      const bounds = featureFocusBounds(feature);
      if (feature.geometry?.type === "Point") map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), props.world ? 5 : 10), duration: moveDuration() });
      else if (bounds) map.fitBounds(bounds, { padding: 65, maxZoom: props.world ? 7 : 12, duration: moveDuration() });
    };
    props.handle.current = {
      zoom: delta => map.zoomTo(Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + delta)), { duration: moveDuration() }),
      home: () => map.fitBounds(props.world ? [[-179, -82], [179, 82]] : [[73, 3], [136, 54]], { padding: 30, duration: moveDuration() }),
      focus, center: () => { const c = map.getCenter(); return [c.lng, c.lat]; },
      visit: record => map.easeTo({ center: [record.longitude, record.latitude], zoom: Math.max(9, map.getZoom()), duration: moveDuration() }),
    };
    map.on("load", () => { loadedMap.current = map; props.handle.current?.home(); setReady(true); setError(""); });
    map.on("error", () => setError("这一层地图暂时未能完整显示，请重试。"));
    openCluster.current = async (id, point, count) => {
      const ticket = ++requestId.current;
      const data = current.current.data;
      const kind = data.features.find(f => f.geometry.type === "Point")?.properties.kind;
      const title = `${count} 个${pointKindName(kind)}`;
      setDetail({ title, description: "正在展开这一组地点…" });
      try {
        const source = map.getSource("places") as GeoJSONSource;
        const [zoom, leaves] = await Promise.all([source.getClusterExpansionZoom(id), source.getClusterLeaves(id, 30, 0)]);
        if (ticket !== requestId.current || mapRef.current !== map || current.current.data !== data) return;
        const ids = new Set(leaves.map(f => f.properties?.id));
        const features = data.features.filter(f => ids.has(f.properties.id));
        setDetail({ title, description: clusterSummary(kind, count), features, total: count, point,
          expansionZoom: Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 1, zoom)) });
      } catch {
        if (ticket === requestId.current && mapRef.current === map) setDetail({ title, description: "这一组地点还没准备好，请再点一次。" });
      }
    };
    map.on("click", event => {
      const now = current.current;
      if (now.picking) { now.onPick([event.lngLat.lng, event.lngLat.lat]); return; }
      const pointLayers = ["points", "clusters"].filter(id => !!map.getLayer(id));
      const hits = pointLayers.length ? map.queryRenderedFeatures([[event.point.x - 12, event.point.y - 12], [event.point.x + 12, event.point.y + 12]], { layers: pointLayers }) : [];
      const hit = hits[0] ?? (map.getLayer("regions") ? map.queryRenderedFeatures(event.point, { layers: ["regions"] })[0] : undefined);
      if (!hit) { requestId.current += 1; setDetail(null); return; }
      if (hit.properties.cluster) {
        openCluster.current(Number(hit.properties.cluster_id), (hit.geometry as { coordinates: [number, number] }).coordinates, Number(hit.properties.point_count));
        return;
      }
      const feature = now.data.features.find(f => f.properties?.id === hit.properties.id);
      if (feature) openFeature(feature);
    });
    map.on("mousemove", event => {
      if (current.current.picking) return;
      const layers = ["points", "clusters", "regions"].filter(id => !!map.getLayer(id));
      map.getCanvas().style.cursor = layers.length && map.queryRenderedFeatures(event.point, { layers }).length ? "pointer" : "";
    });
    const onMove = () => refreshMarkers.current();
    map.on("moveend", onMove);
    const reportZoom = () => {
      const now = current.current;
      let selected: MapFeature | undefined;
      if (map.getLayer("regions")) {
        const hits = map.queryRenderedFeatures(map.project(map.getCenter()), { layers: ["regions"] });
        selected = now.data.features.find(f => f.properties?.id === hits[0]?.properties.id);
      }
      now.onZoom(map.getZoom(), selected);
    };
    map.on("zoomend", reportZoom);
    map.on("sourcedata", event => {
      if (event.sourceId === "regions" && event.isSourceLoaded && loadedMap.current === map) reportZoom();
      if (event.sourceId === "places" && event.isSourceLoaded && loadedMap.current === map) refreshMarkers.current();
    });
    const resize = new ResizeObserver(() => map.resize()); resize.observe(container.current);
    return () => {
      requestId.current += 1; resize.disconnect(); props.handle.current = null; setReady(false);
      markers.current.forEach(m => m.remove()); markers.current = [];
      sourceData.current.clear(); loadedMap.current = null; mapRef.current = null; map.remove();
    };
  }, [props.world, attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || loadedMap.current !== map) return;
    setError("");
    const source = (id: string, data: Collection, cluster = false) => {
      if (sourceData.current.get(id) === data) return;
      sourceData.current.set(id, data);
      const old = map.getSource(id) as GeoJSONSource | undefined;
      if (old) old.setData(data);
      else map.addSource(id, { type: "geojson", data, promoteId: "id", tolerance: 0.2, maxzoom: 16,
        ...(cluster ? { cluster: true, clusterRadius: 42, clusterMaxZoom: 7 } : {}) });
    };
    source("land", props.land);
    if (!map.getLayer("land")) map.addLayer({ id: "land", type: "fill", source: "land", paint: { "fill-color": "#325968", "fill-outline-color": "#6b9ba8" } });
    if (props.world && !map.getSource("terrain")) {
      map.addSource("terrain", { type: "image", url: "/api/nature/maps/world/terrain", coordinates: [[-180, 85.051129], [180, 85.051129], [180, -85.051129], [-180, -85.051129]] });
      map.addLayer({ id: "terrain", type: "raster", source: "terrain", paint: { "raster-opacity": 0.9 }, layout: { visibility: "none" } });
    }
    if (map.getLayer("terrain")) map.setLayoutProperty("terrain", "visibility", props.terrain && !props.marine ? "visible" : "none");
    source("regions", regionData);
    source("places", pointData, true);
    const palette: ExpressionSpecification = ["match", ["%", ["to-number", ["get", "color"], 0], COLORS.length], 0, COLORS[0], 1, COLORS[1], 2, COLORS[2], 3, COLORS[3], 4, COLORS[4], 5, COLORS[5], COLORS[6]];
    const base: ExpressionSpecification = ["case", ["==", ["get", "kind"], "languageareas"], ["get", "languageColor"], ["==", ["get", "kind"], "climate"],
      ["match", ["get", "group"], "A", CLIMATE_COLORS[0], "B", CLIMATE_COLORS[1], "C", CLIMATE_COLORS[2], "D", CLIMATE_COLORS[3], CLIMATE_COLORS[4]], palette];
    const paint: ExpressionSpecification = ["case", ["in", ["get", "id"], ["literal", props.lights]], "#f6d77a", props.world ? base : "#466887"];
    if (!map.getLayer("regions")) {
      map.addLayer({ id: "regions", type: "fill", source: "regions", paint: { "fill-opacity": 0.75, "fill-color": paint } });
      map.addLayer({ id: "edges", type: "line", source: "regions", paint: { "line-color": "#bbd5e9", "line-width": 1.2, "line-opacity": 0.85 } });
      map.addLayer({ id: "selected", type: "line", source: "regions", paint: { "line-color": "#fff1b2", "line-width": 3.5 } });
      map.addLayer({ id: "clusters", type: "circle", source: "places", filter: ["has", "point_count"], paint: { "circle-color": "#8D73FF", "circle-radius": ["step", ["get", "point_count"], 24, 50, 29, 500, 34], "circle-stroke-color": "#ded1ff", "circle-stroke-width": 2 } });
      map.addLayer({ id: "points", type: "circle", source: "places", filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#f6d77a", "circle-radius": 9, "circle-stroke-color": "#40384b", "circle-stroke-width": 1.5 } });
    }
    if (!map.getLayer("selected-point")) map.addLayer({ id: "selected-point", type: "circle", source: "places",
      filter: ["==", ["get", "id"], props.selected], paint: { "circle-radius": 15, "circle-color": "#f6d77a", "circle-opacity": 0.25, "circle-stroke-color": "#fff1b2", "circle-stroke-width": 3 } });
    map.setFilter("selected-point", ["==", ["get", "id"], props.selected]);
    // Only land pixels cover marine fills; the original ocean palette remains visible.
    if (props.marine && !map.getSource("terrain-land")) {
      map.addSource("terrain-land", { type: "image", url: "/api/nature/maps/world/terrainlandv1", coordinates: [[-180, 85.051129], [180, 85.051129], [180, -85.051129], [-180, -85.051129]] });
      map.addLayer({ id: "terrain-land", type: "raster", source: "terrain-land", paint: { "raster-opacity": 1 } }, "edges");
    }
    if (map.getLayer("terrain-land")) map.setLayoutProperty("terrain-land", "visibility", props.marine ? "visible" : "none");
    if (props.terrain && !props.marine && map.getLayer("terrain")) map.moveLayer("terrain", "edges");
    if (props.data.features.some(f => f.properties.kind === "languageareas")) {
      for (const language of CORE_LANGUAGES) if (!map.hasImage(`language-stripe-${language.id}`)) map.addImage(`language-stripe-${language.id}`, languageStripe(language.color));
      if (!map.getLayer("language-secondary")) map.addLayer({ id: "language-secondary", type: "fill", source: "regions",
        filter: ["all", ["==", ["get", "kind"], "languageareas"], ["!=", ["get", "secondaryLanguage"], ""]],
        paint: { "fill-pattern": ["get", "languagePattern"], "fill-opacity": 0.75 } }, "edges");
    }
    map.setPaintProperty("regions", "fill-color", paint);
    map.setPaintProperty("regions", "fill-antialias", props.data.features[0]?.properties?.kind !== "climate");
    map.setPaintProperty("edges", "line-opacity", props.data.features[0]?.properties?.kind === "climate" ? 0 : 0.8);
    const selectedIds = selectedRegionIds(props.data, props.selected);
    map.setFilter("selected", ["in", ["get", "id"], ["literal", selectedIds]]);
    refreshMarkers.current = () => {
      if (!map.getSource("places") || map.isMoving()) return;
      markers.current.forEach(marker => marker.remove()); markers.current = [];
      const viewport = map.getBounds(); const occupied: { x: number; y: number; width: number }[] = [];
      const add = (point: [number, number], element: HTMLElement) => {
        markers.current.push(new Marker({ element, subpixelPositioning: true }).setLngLat(point).addTo(map));
      };
      // Use accessible DOM counters so cluster counts work offline without glyph downloads.
      const clusterIds = new Set<number>();
      for (const cluster of map.querySourceFeatures("places", { filter: ["has", "point_count"] })) {
        const id = Number(cluster.properties?.cluster_id);
        if (clusterIds.has(id) || cluster.geometry.type !== "Point") continue;
        clusterIds.add(id);
        const point = cluster.geometry.coordinates as [number, number];
        if (!viewport.contains(point)) continue;
        const count = Number(cluster.properties?.point_count);
        const button = document.createElement("button"); button.type = "button"; button.className = "geo-cluster-count";
        button.textContent = String(count);
        button.setAttribute("aria-label", `查看这里的 ${count} 个${pointKindName(pointData.features[0]?.properties.kind)}`);
        button.onclick = event => { event.stopPropagation(); if (current.current.picking) current.current.onPick(point); else openCluster.current(id, point, count); };
        add(point, button);
        const pixel = map.project(point); occupied.push({ x: pixel.x, y: pixel.y, width: 65 });
      }
      // City markers are separate from thematic point clusters and disappear with this layer.
      // Prioritize the selected country and capital; use the same native marker movement.
      const cityCandidates = props.cities.features.filter(city => cityVisible(city, map.getZoom(), selectedIds)).sort((a, b) =>
        Number(b.properties.id === props.selectedCity) - Number(a.properties.id === props.selectedCity)
        || Number(selectedIds.includes(String(b.properties.countryId))) - Number(selectedIds.includes(String(a.properties.countryId)))
        || Number(b.properties.capital) - Number(a.properties.capital)
        || Number(b.properties.rank) - Number(a.properties.rank));
      let cityCount = 0;
      for (const city of cityCandidates) {
        if (cityCount >= 35 || city.geometry.type !== "Point" || !viewport.contains(city.geometry.coordinates)) continue;
        const pixel = map.project(city.geometry.coordinates);
        const width = Math.min(210, String(city.properties.name).length * 18 + 46);
        // City text extends right from its location; collision boxes use the same origin.
        const centerX = pixel.x + width / 2 - 16;
        if (occupied.some(p => Math.abs(p.x - centerX) < (p.width + width) / 2 + 6 && Math.abs(p.y - pixel.y) < 44)) continue;
        const button = document.createElement("button"); button.type = "button";
        button.className = "geo-city-marker" + (city.properties.capital ? " is-capital" : "");
        button.setAttribute("aria-label", String(city.properties.role) + "：" + city.properties.name);
        button.setAttribute("aria-pressed", String(city.properties.id === props.selectedCity));
        const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = city.properties.capital ? "★" : "●";
        const name = document.createElement("span"); name.textContent = String(city.properties.name);
        button.append(icon, name); button.title = String(city.properties.role) + "：" + city.properties.name;
        button.onclick = event => { event.stopPropagation(); setDetail(null); current.current.onCity(city); };
        markers.current.push(new Marker({ element: button, anchor: "left", offset: [-16, 0], subpixelPositioning: true }).setLngLat(city.geometry.coordinates).addTo(map));
        occupied.push({ x: centerX, y: pixel.y, width }); cityCount += 1;
      }
      // Browser-native labels avoid font requests and remain keyboard-accessible offline.
      const candidates = props.data.features.filter(f => f.properties?.name && f.properties?.kind !== "climate");
      candidates.sort((a, b) => Number(selectedIds.includes(String(b.properties.id))) - Number(selectedIds.includes(String(a.properties.id))) || featureWeight(b) - featureWeight(a));
      let count = 0;
      for (const f of candidates) {
        if (count >= 45) break;
        const center = featureCenter(f); if (!center || !viewport.contains(center)) continue;
        if (f.geometry?.type === "Point" && map.getZoom() < 4) continue;
        const pixel = map.project(center); const width = Math.min(180, String(f.properties.name).length * 18 + 18);
        if (occupied.some(p => Math.abs(p.x - pixel.x) < (p.width + width) / 2 + 8 && Math.abs(p.y - pixel.y) < 44)) continue;
        occupied.push({ x: pixel.x, y: pixel.y, width });
        const label = document.createElement("button"); label.type = "button"; label.className = "geo-map-label";
        label.textContent = `${(props.lights.includes(String(f.properties?.id)) || (props.world && selectedIds.includes(String(f.properties.id)))) ? "✓ " : ""}${f.properties?.name}`;
        label.title = String(f.properties.name);
        label.onclick = event => { event.stopPropagation(); if (current.current.picking) current.current.onPick(center); else openFeature(f); };
        add(center, label); count += 1;
      }
      const detailed = canShowPhoto(map.getZoom());
      const visits = props.footprints.filter(f => viewport.contains([f.longitude, f.latitude]));
      const groups = new Map<string, Footprint[]>();
      for (const visit of visits) {
        const pixel = map.project([visit.longitude, visit.latitude]);
        const cell = `${Math.floor(pixel.x / (detailed ? 92 : 48))}:${Math.floor(pixel.y / (detailed ? 82 : 48))}`;
        groups.set(cell, [...(groups.get(cell) ?? []), visit]);
      }
      for (const group of groups.values()) {
        const visit = group[0]; const button = document.createElement("button"); button.type = "button";
        button.className = `geo-visit-marker ${detailed && visit.photos[0] ? "has-photo" : ""}`;
        button.setAttribute("aria-label", group.length > 1 ? `此处 ${group.length} 条足迹，放大查看` : `查看足迹：${visit.title}`);
        if (detailed && visit.photos[0]) { const img = document.createElement("img"); img.src = photoUrl(visit.photos[0].id); img.alt = visit.title; button.append(img); }
        const caption = document.createElement("span"); caption.textContent = group.length > 1 ? `${group.length} 个足迹` : detailed ? visit.title : "●"; button.append(caption);
        button.onclick = event => {
          event.stopPropagation();
          if (group.length > 1 && map.getZoom() < 15) map.easeTo({ center: [visit.longitude, visit.latitude], zoom: map.getZoom() + 2, duration: reducedMotion() ? 0 : 350 });
          else current.current.onVisit(visit);
        };
        add([visit.longitude, visit.latitude], button);
      }
      if (props.picked) { const point = document.createElement("div"); point.className = "geo-picked-marker"; point.textContent = "新足迹"; add(props.picked, point); }
    };
    refreshMarkers.current();
  }, [ready, props.data, props.cities, props.selectedCity, props.land, props.terrain, props.marine, props.lights, props.selected, props.footprints, props.picked]);

  return <div className={`geo-map-stage ${props.picking ? "is-picking" : ""}`}>
    <div ref={container} className="geo-map-canvas" />
    {!ready && !error && <div className="geo-map-message" role="status">地图正在展开…</div>}
    {error && <div className="geo-map-message" role="alert">{error}<button onClick={() => { setError(""); setAttempt(a => a + 1); }}>重新绘制</button></div>}
    {detail && !props.picking && <section className="geo-map-detail" aria-label="地图地点详情" onKeyDown={event => { if (event.key === "Escape") { requestId.current += 1; setDetail(null); } }}>
      <header><h2>{detail.title}</h2><button aria-label="关闭地点详情" onClick={() => { requestId.current += 1; setDetail(null); }}>关闭</button></header>
      <p role="status">{detail.description}</p>
      {detail.point && <button className="geo-wide" onClick={() => {
        mapRef.current?.easeTo({ center: detail.point, zoom: detail.expansionZoom, duration: reducedMotion() ? 0 : 350 });
        setDetail(null);
      }}>放大展开这一组</button>}
      {detail.features ? <div className="geo-map-detail-list">{detail.features.map(feature =>
        <button key={String(feature.properties.id)} onClick={() => { openFeature(feature); props.handle.current?.focus(feature); }}>{pointTitle(feature)}</button>)}</div>
        : props.selected && <button onClick={() => { const feature = props.data.features.find(f => f.properties.id === props.selected); if (feature) props.handle.current?.focus(feature); }}>放大看看</button>}
      {!!detail.total && detail.total > (detail.features?.length ?? 0) && <p>先显示 {detail.features?.length ?? 0} 个；放大展开后可看更多，也可在右侧搜索名称。</p>}
    </section>}
    {props.picking && <div className="geo-map-instruction">点一个地方，留下足迹</div>}
  </div>;
}
