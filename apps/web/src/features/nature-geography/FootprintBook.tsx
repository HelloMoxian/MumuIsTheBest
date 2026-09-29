import { useEffect, useRef, useState } from "react";
import { api, jsonRequest, photoUrl, type Footprint, type GeographyState } from "./model";
import type { MapHandle } from "./GeographyMap";

interface Props {
  state: GeographyState | null; onChange: (value: GeographyState) => void;
  map: React.RefObject<MapHandle | null>; point: [number, number] | null;
  onPoint: (point: [number, number] | null) => void; onPicking: (value: boolean) => void;
  onDraft: (value: boolean) => void; visit: Footprint | null; onVisit: (record: Footprint | null) => void;
}
interface Draft { id: string; title: string; date: string; note: string; files: File[]; editing: boolean }
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };
const readPhoto = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("照片无法读取，请重新选择。")); reader.readAsDataURL(file);
});

export function FootprintBook({ state, onChange, map, point, onPoint, onPicking, onDraft, visit, onVisit }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0), [deleting, setDeleting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { onDraft(!!draft); }, [!!draft, onDraft]);
  useEffect(() => {
    const urls = draft?.files.map(file => URL.createObjectURL(file)) ?? []; setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [draft?.files]);
  useEffect(() => {
    if (!draft) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [draft]);
  useEffect(() => {
    if (visit && dialog.current) {
      lastFocus.current = document.activeElement as HTMLElement; setPhotoIndex(0); setDeleting(false); dialog.current.showModal();
    } else if (dialog.current?.open) { dialog.current.close(); lastFocus.current?.focus(); }
  }, [visit?.id]);
  const finish = () => { setDraft(null); onPoint(null); onPicking(false); };
  async function persist(run: () => Promise<GeographyState>, text: string) {
    if (busy) return false; setBusy(true); setMessage("");
    try { onChange(await run()); setMessage(text); return true; }
    catch (error) { setMessage((error as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function save() {
    if (!draft || !point || !state) return;
    const done = await persist(async () => draft.editing
      ? api<GeographyState>("/footprints/" + draft.id, jsonRequest("PATCH", { title: draft.title, date: draft.date, note: draft.note }))
      : api<GeographyState>("/footprints", jsonRequest("POST", { id: draft.id, title: draft.title, date: draft.date, note: draft.note,
        longitude: point[0], latitude: point[1], photos: await Promise.all(draft.files.map(readPhoto)) })),
    "足迹已保存在本机。放大地图，就能看见照片。");
    if (done) finish();
  }
  return <section className="geo-book" aria-label="旅行记录">
    {message && <p className="geo-feedback" role="status">{message}</p>}
    {!draft ? <>
      <button className="geo-primary geo-wide" disabled={!state} onClick={() => {
        setDraft({ id: crypto.randomUUID(), title: "", date: today(), note: "", files: [], editing: false });
        onPoint(null); onPicking(true); setMessage("");
      }}>＋ 添加足迹</button>
      <p className="geo-hint">远处看位置，放大后看照片。照片与记录只保存在本机。</p>
      {!state?.footprints.length && <p>还没有足迹。选一个去过的地方，放上第一张照片吧。</p>}
      <div className="geo-visits">{state?.footprints.map(record => <div className="geo-visit-row" key={record.id}>
        <button onClick={() => { map.current?.visit(record); onVisit(record); }}>
          {record.photos[0] && <img src={photoUrl(record.photos[0].id)} alt="" loading="lazy" />}
          <span><strong>{record.title}</strong><small>{record.date} · {record.photos.length} 张照片</small></span>
        </button><button onClick={() => map.current?.visit(record)} aria-label={"定位" + record.title}>定位</button>
      </div>)}</div>
    </> : <form className="geo-draft" onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2>{draft.editing ? "编辑记录" : "留下一段回忆"}</h2>
      {!draft.editing && <div className="geo-form-actions">
        <button type="button" disabled={busy} onClick={() => onPicking(true)}>{point ? "重新选点" : "在地图选点"}</button>
        <button type="button" disabled={busy} onClick={() => { const p = map.current?.center(); if (p) { onPoint(p); onPicking(false); } }}>选地图中心</button>
      </div>}
      <p className="geo-hint">{point ? "已选位置：" + point.map(n => n.toFixed(4)).join("，") : "先点地图，也可以移动地图后选择中心。"}</p>
      <label>地点名称<input value={draft.title} required maxLength={60} disabled={busy} placeholder="例如：西湖边" onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>旅行日期<input type="date" value={draft.date} required disabled={busy} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
      <label>想记住的事<textarea value={draft.note} rows={4} maxLength={2000} disabled={busy} placeholder="今天看到了什么？" onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
      {!draft.editing && <><label>添加照片（最多 4 张，每张 8 MB）
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 4 || files.some(f => f.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(f.type))) {
            setMessage("请选择最多 4 张 JPG、PNG 或 WebP 照片，每张小于 8 MB。"); e.target.value = ""; return;
          }
          setDraft({ ...draft, files }); setMessage("");
        }} /></label><div className="geo-photo-preview">{previews.map((url, index) => <img key={url} src={url} alt={"待保存照片 " + (index + 1)} />)}</div></>}
      <div className="geo-form-actions"><button className="geo-primary" disabled={busy || !point || !state || !draft.title.trim() || !draft.date}>{busy ? "正在保存…" : "保存足迹"}</button>
        <button type="button" disabled={busy} onClick={() => {
          if ((draft.title || draft.note || draft.files.length) && !window.confirm("这条足迹还没有保存，确定放弃吗？")) return; finish();
        }}>取消</button></div>
    </form>}
    <dialog ref={dialog} className="geo-photo-dialog" aria-labelledby="geo-visit-title"
      onCancel={e => { if (busy) e.preventDefault(); else onVisit(null); }} onClose={() => { onVisit(null); lastFocus.current?.focus(); }}>
      {visit && <><div className="geo-dialog-top"><h2 id="geo-visit-title">{visit.title}</h2><button disabled={busy} onClick={() => onVisit(null)}>关闭</button></div>
        <p>{visit.date}</p>{visit.photos[photoIndex] && <img className="geo-full-photo" src={photoUrl(visit.photos[photoIndex].id, "full")} alt={visit.title + "，照片 " + (photoIndex + 1)} />}
        {visit.photos.length > 1 && <div className="geo-form-actions">{visit.photos.map((photo, i) => <button key={photo.id} aria-pressed={i === photoIndex} onClick={() => setPhotoIndex(i)}>照片 {i + 1}</button>)}</div>}
        <p className="geo-visit-note">{visit.note || "这次旅行还没有文字记录。"}</p>
        {message && <p role="status">{message}</p>}
        <div className="geo-form-actions"><button disabled={busy || !!draft} onClick={() => {
          setDraft({ id: visit.id, title: visit.title, date: visit.date, note: visit.note, files: [], editing: true });
          onPoint([visit.longitude, visit.latitude]); onVisit(null);
        }}>编辑记录</button><button disabled={busy} onClick={() => setDeleting(true)}>删除这条足迹</button></div>
        {deleting && <div className="geo-feedback"><p>删除「{visit.title}」和它的照片？此操作无法撤销。</p>
          <div className="geo-form-actions"><button disabled={busy} onClick={async () => {
            if (await persist(() => api<GeographyState>("/footprints/" + visit.id, jsonRequest("DELETE")), "已删除这条足迹。")) onVisit(null);
          }}>确认删除</button><button disabled={busy} onClick={() => setDeleting(false)}>保留足迹</button></div>
        </div>}
      </>}
    </dialog>
  </section>;
}
