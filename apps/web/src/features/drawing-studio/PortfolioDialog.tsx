import { useEffect, useMemo, useRef, useState } from "react";
import { filterPortfolio, type PortfolioCatalog, type PortfolioWork } from "./portfolio";
import { loadPortfolioCatalog, loadPortfolioCategory } from "./portfolio-data";
import "./portfolio.css";
import "./painting-reference.css";
import { getPaintingReference } from "./painting-references";

function Preview({ work, title }: { work: PortfolioWork; title: string }) {
  return <svg viewBox="0 0 1000 800" role="img" aria-label={title}>
    {work.elements.map((e) => <g key={e.id} transform={`translate(${e.x} ${e.y}) rotate(${e.rotation} ${e.width / 2} ${e.height / 2}) scale(${e.width / 100} ${e.height / 100})`}
      fill="#ffffff" stroke="#000000" strokeWidth={3} strokeLinejoin="round">
      {e.shape === "free-rectangle" ? <rect width={100} height={100} vectorEffect="non-scaling-stroke" />
        : e.shape === "free-ellipse" ? <ellipse cx={50} cy={50} rx={50} ry={50} vectorEffect="non-scaling-stroke" />
          : <polygon points="50,0 100,100 0,100" vectorEffect="non-scaling-stroke" />}
    </g>)}
  </svg>;
}

const PAGE_SIZE = 12;

export function PortfolioDialog({ onClose, onOpen, needsSave }: {
  onClose: () => void; onOpen: (work: PortfolioWork) => Promise<void>; needsSave: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const detailBack = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const [catalog, setCatalog] = useState<PortfolioCatalog | null>(null);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [works, setWorks] = useState(new Map<string, PortfolioWork>());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openError, setOpenError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    if (!catalog) {
      setLoading(true);
      void loadPortfolioCatalog().then((value) => { if (active) setCatalog(value); })
        .catch(() => { if (active) { setError("作品集暂时没有打开，请重试。"); setLoading(false); } });
    }
    return () => { active = false; };
  }, [catalog, attempt]);
  const filtered = useMemo(() => catalog ? filterPortfolio(catalog, category, query) : [], [catalog, category, query]);
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const entries = useMemo(() => filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE), [filtered, currentPage]);
  useEffect(() => {
    if (!catalog) return;
    let active = true;
    setLoading(true); setError("");
    const ids = [...new Set(entries.map((w) => w.categoryId))];
    void Promise.all(ids.map((id) => loadPortfolioCategory(id, catalog))).then((groups) => {
      if (!active) return;
      setWorks(new Map(groups.flatMap((group) => [...group.entries()])));
      setLoading(false);
    }).catch(() => {
      if (active) { setError("这一页作品暂时没有完整打开，请重试。"); setLoading(false); }
    });
    return () => { active = false; };
  }, [catalog, entries, attempt]);
  useEffect(() => { if (selected) detailBack.current?.focus(); }, [selected]);

  const entry = catalog?.works.find((w) => w.id === selected);
  const chosen = selected ? works.get(selected) : undefined;
  const reference = getPaintingReference(chosen?.portfolioReferenceId);
  const close = () => { if (!busyRef.current) onClose(); };
  const start = async () => {
    if (!chosen || busyRef.current) return;
    busyRef.current = true; setBusy(true); setOpenError("");
    try { await onOpen(chosen); }
    catch (reason) { setOpenError(reason instanceof Error ? reason.message : "暂时没有打开，当前画布已保留，请重试。"); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const back = () => {
    const id = selected;
    setSelected(null); setOpenError("");
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(`[data-work-id="${id}"]`)?.focus());
  };

  return <dialog ref={dialog} className="drawing-portfolio" aria-labelledby="portfolio-title"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className="portfolio-heading">
      <h2 id="portfolio-title">预制作品集</h2>
      <button type="button" disabled={busy} onClick={close}>关闭</button>
    </div>
    {selected && entry && chosen ? <div className="portfolio-detail">
      <button ref={detailBack} type="button" disabled={busy} onClick={back}>← 返回作品集</button>
      <h3>{entry.title}</h3>
      {reference && <div className="portfolio-reference-note">
        <img src={reference.image} alt={reference.title + "原画"} />
        <p>{reference.artist} · 构图简化版<br />开始后可打开、移动和缩放原画参考。</p>
      </div>}
      <div className="portfolio-large-preview"><Preview work={chosen} title={`${entry.title}黑白线稿`} /></div>
      <p>{entry.elementCount} 个图形，都可以单独涂色、移动和重新拼装。</p>
      {needsSave && <p>先将当前画布保存为副本，再开始这幅作品。</p>}
      {openError && <p className="portfolio-error" role="alert">{openError}</p>}
      <button className="portfolio-primary" type="button" disabled={busy} onClick={() => { void start(); }}>
        {busy ? "正在准备画布…" : needsSave ? "保存当前画布并开始" : "开始涂色"}
      </button>
    </div> : <>
      <div className="portfolio-filters">
        <label>找作品<input autoFocus type="search" value={query} maxLength={80} placeholder="输入名字，例如火车、花园"
          onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
        <label>选主题<select value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }}>
          <option value="all">全部主题</option>
          {catalog?.categories.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.count} 幅</option>)}
        </select></label>
      </div>
      <p className="portfolio-count" aria-live="polite">{catalog ? `找到 ${filtered.length} 幅 · 共 ${catalog.works.length} 幅` : "正在打开作品集…"}</p>
      {loading ? <p role="status">正在准备黑白作品…</p> : error ? <div role="alert">
        <p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>重试</button>
      </div> : filtered.length === 0 ? <div className="portfolio-empty">
        <p>还没有找到这个作品，换个名字或主题试试。</p>
        <button type="button" onClick={() => { setQuery(""); setCategory("all"); setPage(0); }}>清除筛选</button>
      </div> : <div className="portfolio-grid">
        {entries.map((item) => {
          const work = works.get(item.id);
          return <button className="portfolio-card" key={item.id} data-work-id={item.id} type="button" disabled={!work}
            onClick={() => { setSelected(item.id); setOpenError(""); }}>
            {work && <Preview work={work} title={`${item.title}预览`} />}
            <strong>{item.title}</strong><span>{item.elementCount} 个图形 · {item.complexity}</span>
          </button>;
        })}
      </div>}
      {catalog && filtered.length > 0 && <nav className="portfolio-pagination" aria-label="作品集分页">
        <button type="button" disabled={loading || currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <span aria-live="polite">{currentPage + 1} / {maxPage + 1}</span>
        <button type="button" disabled={loading || currentPage >= maxPage} onClick={() => setPage(currentPage + 1)}>下一页</button>
      </nav>}
    </>}
  </dialog>;
}
