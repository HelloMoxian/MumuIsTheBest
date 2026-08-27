import { useEffect, useMemo, useState } from "react";
import { CompactExperienceControls } from "../../shared/experience";
import {
  filterRankingRows,
  parseUniversityRankingData,
  regionsForSubject,
  type UniversityCategory,
  type UniversityRankingData,
} from "./logic";
import "./university-top100.css";

const DATA_URL = "/data/university-rankings-2025.json";
const DEFAULT_CATEGORY = "AS02";
const DEFAULT_SUBJECT = "AS0229";

function RemoteIcon({
  src,
  alt,
  className,
  fallback,
}: {
  src: string;
  alt: string;
  className: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={`${className} icon-fallback`} aria-label={`${alt}图片暂不可用`}>{fallback}</span>;
  }
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function LoadingTable() {
  return (
    <div className="university-loading" aria-live="polite">
      <strong>正在展开大学星图…</strong>
      <div className="university-loading-rows" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
      </div>
    </div>
  );
}

function categoryForCode(data: UniversityRankingData, code: string) {
  return data.categories.find((category) => category.code === code) ?? data.categories[0];
}

function selectedSubjectName(category: UniversityCategory, code: string) {
  return category.subjects.find((subject) => subject.code === code)?.name
    ?? category.subjects[0]?.name
    ?? "未选择专业";
}

export function UniversityTop100Page() {
  const [data, setData] = useState<UniversityRankingData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [categoryCode, setCategoryCode] = useState(DEFAULT_CATEGORY);
  const [subjectCode, setSubjectCode] = useState(DEFAULT_SUBJECT);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("全部");

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    setData(null);
    void fetch(DATA_URL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`榜单文件读取失败（${response.status}）`);
        return response.json() as Promise<unknown>;
      })
      .then((value) => setData(parseUniversityRankingData(value)))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "大学榜单暂时无法打开。");
      });
    return () => controller.abort();
  }, [loadVersion]);

  const category = data ? categoryForCode(data, categoryCode) : null;
  const activeSubjectCode = category?.subjects.some((subject) => subject.code === subjectCode)
    ? subjectCode
    : category?.subjects[0]?.code ?? subjectCode;
  const rows = useMemo(
    () => data ? filterRankingRows(data, activeSubjectCode, query, region) : [],
    [activeSubjectCode, data, query, region],
  );
  const sourceRows = data?.rankings[activeSubjectCode] ?? [];
  const regions = useMemo(
    () => data ? regionsForSubject(data, activeSubjectCode) : [],
    [activeSubjectCode, data],
  );
  const currentSubjectName = category
    ? selectedSubjectName(category, activeSubjectCode)
    : "人工智能";

  const changeCategory = (nextCategory: UniversityCategory) => {
    setCategoryCode(nextCategory.code);
    setSubjectCode(nextCategory.subjects[0]?.code ?? "");
    setRegion("全部");
  };

  const changeSubject = (nextSubjectCode: string) => {
    setSubjectCode(nextSubjectCode);
    setRegion("全部");
  };

  const clearFilters = () => {
    setQuery("");
    setRegion("全部");
  };

  return (
    <div className="university-shell">
      <div className="university-star-field" aria-hidden="true" />
      <header className="university-topbar">
        <a className="university-brand" href="/" aria-label="返回木木学习岛首页">
          <span aria-hidden="true">🚀</span>
          <strong>木木学习岛</strong>
        </a>
        <CompactExperienceControls />
        <nav className="university-primary-nav" aria-label="主导航">
          <a href="/">学习大厅</a>
        </nav>
      </header>

      <main className="university-main">
        <nav className="university-secondary-nav" aria-label="规划与大学页面导航">
          <span>规划 / 大学</span>
          <a href="/universities/top100" aria-current="page"><b aria-hidden="true">✓</b> Top100</a>
        </nav>

        <section className="university-heading" aria-labelledby="university-page-title">
          <div>
            <p className="university-eyebrow">2025 世界一流学科排名 · 5 大领域 · 57 个专业</p>
            <h1 id="university-page-title">大学 <em>Top100</em></h1>
            <p>先选领域和专业，再看看世界各地哪些大学站在前列。</p>
          </div>
          <div className="university-orbit-mark" aria-hidden="true"><span>100</span></div>
        </section>

        {loadError ? (
          <section className="university-error" role="alert">
            <span aria-hidden="true">!</span>
            <div><strong>大学星图没有完全打开</strong><p>{loadError}</p></div>
            <button type="button" onClick={() => setLoadVersion((version) => version + 1)}>再试一次</button>
          </section>
        ) : !data || !category ? (
          <LoadingTable />
        ) : (
          <>
            <section className="university-selector" aria-labelledby="university-selector-title">
              <div className="university-panel-title">
                <div><span>01</span><div><h2 id="university-selector-title">选择专业领域</h2><p>第一层选领域，第二层选专业</p></div></div>
                <strong>{category.name} · {currentSubjectName}</strong>
              </div>
              <div className="university-category-tabs" role="list" aria-label="专业领域">
                {data.categories.map((item) => {
                  const selected = item.code === category.code;
                  return (
                    <button
                      key={item.code}
                      className={selected ? "is-selected" : ""}
                      type="button"
                      onClick={() => changeCategory(item)}
                      aria-pressed={selected}
                    >
                      {selected && <b aria-hidden="true">✓</b>}
                      <span>{item.name}</span>
                      <small>{item.subjects.length} 个专业</small>
                    </button>
                  );
                })}
              </div>
              <div className="university-subject-tabs" role="list" aria-label={`${category.name}专业`}>
                {category.subjects.map((subject) => {
                  const selected = subject.code === activeSubjectCode;
                  return (
                    <button
                      key={subject.code}
                      className={selected ? "is-selected" : ""}
                      type="button"
                      onClick={() => changeSubject(subject.code)}
                      aria-pressed={selected}
                    >
                      {selected && <span aria-hidden="true">✓</span>}{subject.name}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="university-ranking" aria-labelledby="university-ranking-title">
              <div className="university-ranking-heading">
                <div>
                  <p className="university-ranking-path">{category.name} <span>›</span> {currentSubjectName}</p>
                  <h2 id="university-ranking-title">{currentSubjectName} Top100</h2>
                  <p>官方本专业共收录 {sourceRows.length} 所大学；筛选不会改变原始名次。</p>
                </div>
                <div className="university-summary" aria-label="榜单摘要">
                  <span><small>年份</small><strong>{data.year}</strong></span>
                  <span><small>当前显示</small><strong>{rows.length}</strong></span>
                  <span><small>国家/地区</small><strong>{regions.length}</strong></span>
                </div>
              </div>

              <div className="university-filters">
                <label>
                  <span>搜索大学</span>
                  <div className="university-search-input"><i aria-hidden="true">⌕</i><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入大学名称" type="search" /></div>
                </label>
                <label>
                  <span>国家或地区</span>
                  <select value={region} onChange={(event) => setRegion(event.target.value)}>
                    <option value="全部">全部国家和地区</option>
                    {regions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <button type="button" onClick={clearFilters} disabled={!query && region === "全部"}>清空筛选</button>
              </div>

              <p className="university-result-status" aria-live="polite">
                {rows.length ? `已找到 ${rows.length} 所大学` : "没有找到符合条件的大学"}
              </p>

              {rows.length ? (
                <div className="university-table-wrap" tabIndex={0} aria-label={`${currentSubjectName}大学榜单，可横向滚动`}>
                  <table className="university-table">
                    <thead><tr><th scope="col">名次</th><th scope="col">大学</th><th scope="col">国家/地区</th><th scope="col">总分</th>{data.indicators.map((indicator) => <th scope="col" key={indicator.code}>{indicator.name}</th>)}</tr></thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${activeSubjectCode}-${row.universityCode}`}>
                          <td><span className={`university-rank university-rank-${row.rankStart <= 3 ? row.rankStart : "rest"}`}>{row.ranking}</span></td>
                          <td>
                            <div className="university-name-cell">
                              <RemoteIcon className="university-logo" src={row.university.logoUrl} alt={`${row.university.name}校徽`} fallback={row.university.name.slice(0, 1)} />
                              <span><strong>{row.university.name}</strong><small>{row.university.code}</small></span>
                            </div>
                          </td>
                          <td>
                            <div className="university-country-cell">
                              {row.country && <RemoteIcon className="university-flag" src={row.country.iconUrl} alt={`${row.university.region}图标`} fallback={row.country.iso2.toUpperCase()} />}
                              <span>{row.university.region}</span>
                            </div>
                          </td>
                          <td className="university-score">{row.score ?? "—"}</td>
                          {data.indicators.map((indicator, index) => <td key={indicator.code}>{row.indicators[index] ?? "—"}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="university-empty">
                  <span aria-hidden="true">⌕</span><strong>还没有找到匹配的大学</strong><p>换一个名称，或者恢复全部国家和地区再看看。</p><button type="button" onClick={clearFilters}>显示全部结果</button>
                </div>
              )}

              <footer className="university-source-note">
                <p><strong>数据说明：</strong>{data.source.note}</p>
                <p>抓取时间：{new Date(data.retrievedAt).toLocaleDateString("zh-CN")} · <a href={data.source.url} target="_blank" rel="noreferrer">查看软科原始榜单 ↗</a></p>
              </footer>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
