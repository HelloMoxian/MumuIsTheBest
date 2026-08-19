import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadKnowledgeTower, toggleKnowledgeMastery } from "./api";
import {
  activeGradeAtReadingLine,
  formatProgressPercent,
  knowledgeLightId,
} from "./logic";
import type {
  KnowledgeGrade,
  KnowledgePoint,
  KnowledgeTowerResponse,
  MasteryLevel,
} from "./types";
import "./math-knowledge-tower.css";

function messageFrom(error: unknown) {
  return error instanceof Error
    ? error.message
    : "数学知识塔暂时没有回应，请稍后再试。";
}

function MasteryLamp({
  point,
  level,
  isLit,
  isBusy,
  onToggle,
}: {
  point: KnowledgePoint;
  level: MasteryLevel;
  isLit: boolean;
  isBusy: boolean;
  onToggle: (point: KnowledgePoint, level: MasteryLevel) => void;
}) {
  return (
    <button
      type="button"
      className={`mkt-lamp is-${level.id} ${isLit ? "is-lit" : "is-unlit"}`}
      aria-pressed={isLit}
      aria-label={`${point.description}，${level.label}，${isLit ? "已点亮，点击熄灭" : "未点亮，点击点亮"}`}
      title={level.description}
      disabled={isBusy}
      onClick={() => onToggle(point, level)}
    >
      <span className="mkt-lamp__bulb" aria-hidden="true">
        <span className="mkt-lamp__shine" />
        <span className="mkt-lamp__check">{isLit ? "✓" : ""}</span>
      </span>
      <span className="mkt-lamp__copy">
        <strong>{level.label}</strong>
        <small>{isBusy ? "正在保存" : isLit ? "再点一下熄灭" : "点一下点亮"}</small>
      </span>
    </button>
  );
}

function KnowledgeCard({
  point,
  grade,
  semesterLabel,
  masteryLevels,
  litLightIds,
  isBusy,
  onToggle,
}: {
  point: KnowledgePoint;
  grade: KnowledgeGrade;
  semesterLabel: string;
  masteryLevels: MasteryLevel[];
  litLightIds: ReadonlySet<string>;
  isBusy: boolean;
  onToggle: (point: KnowledgePoint, level: MasteryLevel) => void;
}) {
  const litCount = masteryLevels.filter((level) => (
    litLightIds.has(knowledgeLightId(point.id, level.id))
  )).length;
  return (
    <article className={`mkt-card ${litCount === 4 ? "is-complete" : ""}`}>
      <div className="mkt-card__heading">
        <div>
          <p className="mkt-card__eyebrow">
            <span>第 {point.sequence} 层</span>
            <span>{grade.label} · {semesterLabel}</span>
          </p>
          <h3>{point.description}</h3>
        </div>
        <span className="mkt-card__count" aria-label={`已点亮 ${litCount} 盏，共 4 盏`}>
          {litCount}<small>/4</small>
        </span>
      </div>
      <div className="mkt-lamps" aria-label={`${point.description}的四级熟练度`}>
        {masteryLevels.map((level) => (
          <MasteryLamp
            key={level.id}
            point={point}
            level={level}
            isLit={litLightIds.has(knowledgeLightId(point.id, level.id))}
            isBusy={isBusy}
            onToggle={onToggle}
          />
        ))}
      </div>
    </article>
  );
}

export function MathKnowledgeTowerPage() {
  const [data, setData] = useState<KnowledgeTowerResponse | null>(null);
  const [activeGradeId, setActiveGradeId] = useState("grade-1");
  const [busyTopicId, setBusyTopicId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [fatalError, setFatalError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gradeSectionsRef = useRef(new Map<string, HTMLElement>());
  const gradeButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const didInitialPositionRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setFatalError("");
    loadKnowledgeTower(controller.signal)
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) setFatalError(messageFrom(error));
      });
    return () => controller.abort();
  }, [loadVersion]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!data || !viewport || didInitialPositionRef.current) return;
    didInitialPositionRef.current = true;
    viewport.scrollTop = viewport.scrollHeight;
    setActiveGradeId("grade-1");
  }, [data]);

  const litLightIds = useMemo(
    () => new Set(data?.progress.litLightIds ?? []),
    [data?.progress.litLightIds],
  );

  const syncActiveGrade = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    const readingLine = viewportRect.top + Math.min(190, viewportRect.height * 0.34);
    const bands = [...gradeSectionsRef.current.entries()].map(([id, element]) => {
      const rect = element.getBoundingClientRect();
      return { id, top: rect.top, bottom: rect.bottom };
    });
    const nextGradeId = activeGradeAtReadingLine(bands, readingLine);
    if (nextGradeId) setActiveGradeId(nextGradeId);
  }, []);

  useEffect(() => {
    gradeButtonsRef.current.get(activeGradeId)?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeGradeId]);

  const goToGrade = useCallback((gradeId: string) => {
    const viewport = viewportRef.current;
    const section = gradeSectionsRef.current.get(gradeId);
    if (!viewport || !section) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const viewportRect = viewport.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    viewport.scrollTo({
      top: viewport.scrollTop + sectionRect.bottom - viewportRect.bottom + 12,
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setActiveGradeId(gradeId);
  }, []);

  const toggleMastery = useCallback(async (
    point: KnowledgePoint,
    level: MasteryLevel,
  ) => {
    if (!data || busyTopicId) return;
    setBusyTopicId(point.id);
    setNotice("");
    try {
      const response = await toggleKnowledgeMastery(point.id, level.id);
      setData((current) => current ? { ...current, progress: response.progress } : current);
      setNotice(
        response.isLit
          ? `${level.label}点亮啦！现在是 ${response.progress.score} 分，数学水平相当于 ${response.progress.equivalentAge.label}。`
          : `${level.label}熄灭啦。现在是 ${response.progress.score} 分，数学水平相当于 ${response.progress.equivalentAge.label}。`,
      );
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setBusyTopicId(null);
    }
  }, [busyTopicId, data]);

  if (!data) {
    return (
      <div className="mkt-page">
        <div className="mkt-stars" aria-hidden="true" />
        <header className="mkt-loading-header">
          <a href="/" className="mkt-back">← 返回学习岛</a>
          <strong>数学知识塔</strong>
        </header>
        <main className="mkt-state" aria-live="polite">
          {fatalError ? (
            <>
              <span className="mkt-state__mark" aria-hidden="true">!</span>
              <h1>知识塔暂时没有连上</h1>
              <p>{fatalError}</p>
              <button
                type="button"
                onClick={() => {
                  didInitialPositionRef.current = false;
                  setLoadVersion((version) => version + 1);
                }}
              >
                再试一次
              </button>
            </>
          ) : (
            <>
              <span className="mkt-state__mark is-loading" aria-hidden="true">∴</span>
              <h1>正在搭好 517 层知识塔…</h1>
              <p>马上从一年级的第一层出发。</p>
            </>
          )}
        </main>
      </div>
    );
  }

  const { catalog, progress } = data;
  const activeGrade = catalog.grades.find((grade) => grade.id === activeGradeId);

  return (
    <div className="mkt-page">
      <div className="mkt-stars" aria-hidden="true" />
      <header className="mkt-dashboard">
        <div className="mkt-dashboard__identity">
          <a href="/" className="mkt-back" aria-label="返回木木学习岛">← 返回</a>
          <div>
            <p>从一年级到九年级 · 由下向上</p>
            <h1>数学知识塔</h1>
          </div>
        </div>
        <div className="mkt-dashboard__metrics" aria-label="数学知识塔成长进度">
          <section className="mkt-metric is-score">
            <span>当前得分</span>
            <strong>{progress.score}<small> / {progress.maxScore}</small></strong>
            <em>点亮 {progress.litCount} 盏灯</em>
          </section>
          <section className="mkt-metric is-progress">
            <span>知识进度</span>
            <strong>{formatProgressPercent(progress.progressPercent)}</strong>
            <div
              className="mkt-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.totalLights}
              aria-valuenow={progress.litCount}
              aria-label={`知识进度 ${formatProgressPercent(progress.progressPercent)}`}
            >
              <i style={{ width: `${Math.min(100, progress.progressPercent)}%` }} />
            </div>
          </section>
          <section className="mkt-metric is-age">
            <span>趣味成长刻度</span>
            <strong>{progress.equivalentAge.label}</strong>
            <em>相当于这么大的小朋友</em>
          </section>
        </div>
        <div className="mkt-dashboard__guide">
          <p><strong>四步点亮：</strong>先知道 → 懂原理 → 会计算 → 能灵活使用</p>
          <p>每亮一盏得 1 分；年龄是趣味进度，不是能力评估。</p>
        </div>
      </header>

      <main className="mkt-workspace">
        <nav className="mkt-grade-rail" aria-label="按年级跳转">
          <div className="mkt-grade-rail__title">
            <span>当前年级</span>
            <strong>{activeGrade?.label ?? "一年级"}</strong>
          </div>
          <div className="mkt-grade-rail__buttons">
            {[...catalog.grades].reverse().map((grade) => (
              <button
                key={grade.id}
                ref={(element) => {
                  if (element) gradeButtonsRef.current.set(grade.id, element);
                  else gradeButtonsRef.current.delete(grade.id);
                }}
                type="button"
                className={activeGradeId === grade.id ? "is-active" : ""}
                aria-current={activeGradeId === grade.id ? "location" : undefined}
                onClick={() => goToGrade(grade.id)}
              >
                <span>{grade.order}</span>
                <strong>{grade.label}</strong>
                <small>{grade.pointCount}层</small>
              </button>
            ))}
          </div>
        </nav>

        <div
          className="mkt-tower-viewport"
          ref={viewportRef}
          onScroll={syncActiveGrade}
          aria-label="数学知识塔全部517个知识点"
        >
          <div className="mkt-tower-cap" aria-hidden="true">
            <span>15</span>
            <strong>九年成长星</strong>
          </div>
          <div className="mkt-tower-stack">
            {catalog.grades.map((grade) => (
              <section
                key={grade.id}
                id={`knowledge-${grade.id}`}
                className={`mkt-grade-band mkt-grade-band--${grade.order}`}
                ref={(element) => {
                  if (element) gradeSectionsRef.current.set(grade.id, element);
                  else gradeSectionsRef.current.delete(grade.id);
                }}
                aria-labelledby={`knowledge-${grade.id}-title`}
              >
                <header className="mkt-grade-gate">
                  <span className="mkt-grade-gate__number">{grade.order}</span>
                  <div>
                    <p>{grade.stage} · {grade.pointCount} 个知识点</p>
                    <h2 id={`knowledge-${grade.id}-title`}>{grade.label}</h2>
                    <span>{grade.order === 1 ? "从这里开始，向上点亮" : "继续向上，发现新本领"}</span>
                  </div>
                </header>
                <div className="mkt-semester-stack">
                  {grade.semesters.map((semester) => (
                    <section className="mkt-semester" key={semester.id}>
                      <header className="mkt-semester__gate">
                        <span>{grade.label}</span>
                        <strong>{semester.label}</strong>
                      </header>
                      <div className="mkt-card-stack">
                        {semester.points.map((point) => (
                          <KnowledgeCard
                            key={point.id}
                            point={point}
                            grade={grade}
                            semesterLabel={semester.label}
                            masteryLevels={catalog.masteryLevels}
                            litLightIds={litLightIds}
                            isBusy={busyTopicId === point.id}
                            onToggle={toggleMastery}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <div className="mkt-live" aria-live="polite" aria-atomic="true">
        {notice}
      </div>
    </div>
  );
}
