import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLearningRewardSession } from "../../shared/LearningCoinLayer";
import { browserTts } from "../../shared/speech";
import {
  clearEchoProgress,
  loadEchoIsland,
  recordEchoCompletion,
  setEchoSentenceMarked,
} from "./api";
import {
  completionCount,
  mergeEchoProgress,
  selectNextEchoSentence,
} from "./logic";
import type {
  EchoCatalog,
  EchoProgress,
  EchoSelection,
  EchoSentence,
} from "./types";
import "./english-echo-island.css";

type PlaybackPhase =
  | "english-ready"
  | "playing-english"
  | "chinese-ready"
  | "playing-chinese"
  | "next-ready"
  | "saving";
type ListFilter = "all" | "marked" | "mastered";

function friendlyError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function playAudio(audioRef: React.MutableRefObject<HTMLAudioElement | null>, url: string) {
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;
    const cleanUp = () => {
      audio.onended = null;
      audio.onerror = null;
      if (audioRef.current === audio) audioRef.current = null;
    };
    audio.onended = () => {
      cleanUp();
      resolve();
    };
    audio.onerror = () => {
      cleanUp();
      reject(new Error("这段真人录音暂时打不开，请再点一次试试。"));
    };
    void audio.play().catch((error) => {
      cleanUp();
      reject(error);
    });
  });
}

function phaseLabel(phase: PlaybackPhase) {
  if (phase === "english-ready") return "播放英文";
  if (phase === "playing-english") return "英文播放中…";
  if (phase === "chinese-ready") return "显示中文并播放";
  if (phase === "playing-chinese") return "中文播放中…";
  if (phase === "next-ready") return "下一句 · 收下知识币";
  return "正在保存这次学习…";
}

function phaseHint(phase: PlaybackPhase) {
  if (phase === "english-ready") return "第一步：先听一遍英文。";
  if (phase === "playing-english") return "认真听，播放结束前按钮会暂时锁定。";
  if (phase === "chinese-ready") return "第二步：揭晓中文，再听一遍意思。";
  if (phase === "playing-chinese") return "把中文意思和刚才的英文声音连起来。";
  if (phase === "next-ready") return "第三步：完成这句，前往下一句并获得知识币。";
  return "正在把练习次数和知识币安全存到本机。";
}

function SentenceLibrary({
  catalog,
  onClose,
  onProgress,
}: {
  catalog: EchoCatalog;
  onClose: () => void;
  onProgress: (progress: EchoProgress) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [playingSentenceId, setPlayingSentenceId] = useState<string | null>(null);
  const [savingSentenceId, setSavingSentenceId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState("");
  const listAudioRef = useRef<HTMLAudioElement | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const marked = useMemo(
    () => new Set(catalog.progress.markedSentenceIds),
    [catalog.progress.markedSentenceIds],
  );
  const counts = useMemo(
    () => new Map(catalog.progress.records.map((record) => [record.sentenceId, record.completionCount])),
    [catalog.progress.records],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSentences = useMemo(() => catalog.sentences.filter((sentence) => {
    const count = counts.get(sentence.id) ?? 0;
    const matchesQuery = !normalizedQuery ||
      sentence.english.toLowerCase().includes(normalizedQuery) ||
      sentence.chinese.includes(query.trim());
    const matchesFilter = filter === "all" ||
      (filter === "marked" && marked.has(sentence.id)) ||
      (filter === "mastered" && count >= catalog.learningRules.masteryCompletionCount);
    return matchesQuery && matchesFilter;
  }), [catalog.learningRules.masteryCompletionCount, catalog.sentences, counts, filter, marked, normalizedQuery, query]);

  useEffect(() => () => {
    listAudioRef.current?.pause();
    if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
  }, []);

  const close = () => {
    listAudioRef.current?.pause();
    onClose();
  };

  const playSentence = async (sentence: EchoSentence) => {
    listAudioRef.current?.pause();
    browserTts.stop();
    setPlayingSentenceId(sentence.id);
    setMessage(`正在试听：${sentence.english}`);
    try {
      await playAudio(listAudioRef, sentence.audio.english);
      setMessage("试听完成；清单试听不会增加练习次数。 ");
    } catch (error) {
      setMessage(friendlyError(error, "录音暂时无法播放。"));
    } finally {
      setPlayingSentenceId(null);
    }
  };

  const toggleMarked = async (sentence: EchoSentence) => {
    setSavingSentenceId(sentence.id);
    try {
      const result = await setEchoSentenceMarked(sentence.id, !marked.has(sentence.id));
      onProgress(result.progress);
      if (result.replacedSentenceId) {
        setMessage("学习池保持 20 句，已用这句替换一条练习次数较高的句子。");
      } else if (result.fallbackSentenceId) {
        setMessage("学习池至少保留一句，已自动补入一条练习次数最低的句子。");
      } else {
        setMessage(marked.has(sentence.id) ? "已从当前学习池移除。" : "已加入当前学习池。 ");
      }
    } catch (error) {
      setMessage(friendlyError(error, "标记暂时无法保存。"));
    } finally {
      setSavingSentenceId(null);
    }
  };

  const clearCounts = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setMessage("再点一次确认清空；当前标记池会保留。 ");
      if (clearTimerRef.current !== null) window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = window.setTimeout(() => setConfirmClear(false), 5_000);
      return;
    }
    setIsClearing(true);
    try {
      const result = await clearEchoProgress();
      onProgress(result.progress);
      setMessage("全部练习次数已清空，当前标记池保持不变。 ");
      setConfirmClear(false);
    } catch (error) {
      setMessage(friendlyError(error, "练习次数暂时无法清空。"));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <aside className="echo-library" role="dialog" aria-modal="true" aria-labelledby="echo-library-title" data-no-ui-translation>
      <header className="echo-library-header">
        <div>
          <span className="echo-kicker">1000 句真人录音</span>
          <h2 id="echo-library-title">全部英文句子</h2>
          <p>试听不计次数；完成“英文 → 中文 → 下一句”才算练习一次。</p>
        </div>
        <button type="button" className="echo-close-button" onClick={close} aria-label="关闭全部句子清单">关闭</button>
      </header>

      <div className="echo-library-tools">
        <label>
          <span>搜索句子</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入英文或中文" />
        </label>
        <div className="echo-filter-group" role="group" aria-label="句子筛选">
          {([
            ["all", "全部"],
            ["marked", `学习池 ${catalog.progress.markedSentenceIds.length}`],
            ["mastered", `已学会 ${catalog.progress.masteredSentenceCount}`],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} className={filter === value ? "is-selected" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {filter === value && <span aria-hidden="true">✓</span>} {label}
            </button>
          ))}
        </div>
        <button type="button" className={`echo-clear-button ${confirmClear ? "is-confirming" : ""}`} disabled={isClearing} onClick={() => void clearCounts()}>
          {isClearing ? "正在清空…" : confirmClear ? "确认清空全部次数" : "清空练习次数"}
        </button>
      </div>

      <div className="echo-library-message" aria-live="polite">{message || `显示 ${visibleSentences.length} 句。`}</div>
      <div className="echo-sentence-list">
        {visibleSentences.length === 0 && (
          <div className="echo-list-empty"><strong>没有找到符合条件的句子</strong><span>换一个关键词或筛选条件试试。</span></div>
        )}
        {visibleSentences.map((sentence) => {
          const count = counts.get(sentence.id) ?? 0;
          const isMarked = marked.has(sentence.id);
          const isMastered = count >= catalog.learningRules.masteryCompletionCount;
          const isPlaying = playingSentenceId === sentence.id;
          return (
            <article className={`echo-list-row ${isMarked ? "is-marked" : ""}`} key={sentence.id}>
              <div className="echo-list-copy">
                <strong>{sentence.english}</strong>
                <span>{sentence.chinese}</span>
                <small>
                  练习 {count} 次
                  {isMarked && <em>当前学习池</em>}
                  {isMastered && <em className="is-mastered">已学会</em>}
                </small>
              </div>
              <div className="echo-list-actions">
                <button type="button" className="echo-list-play" disabled={playingSentenceId !== null} onClick={() => void playSentence(sentence)}>
                  <span aria-hidden="true">{isPlaying ? "◌" : "▶"}</span>{isPlaying ? "播放中" : "试听英文"}
                </button>
                <button
                  type="button"
                  className={`echo-mark-button ${isMarked ? "is-selected" : ""}`}
                  aria-pressed={isMarked}
                  disabled={savingSentenceId !== null}
                  onClick={() => void toggleMarked(sentence)}
                >
                  {savingSentenceId === sentence.id ? "保存中…" : isMarked ? "✓ 已标记" : "加入学习池"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

export function EnglishEchoIslandPage() {
  const [catalog, setCatalog] = useState<EchoCatalog | null>(null);
  const [selection, setSelection] = useState<EchoSelection | null>(null);
  const [phase, setPhase] = useState<PlaybackPhase>("english-ready");
  const [showChinese, setShowChinese] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [status, setStatus] = useState("正在准备真人录音…");
  const [error, setError] = useState<string | null>(null);
  const [criticalVisible, setCriticalVisible] = useState(false);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingCompletionIdRef = useRef<string | null>(null);
  const criticalTimerRef = useRef<number | null>(null);
  const reward = useLearningRewardSession("english:echo-island");

  useEffect(() => {
    const controller = new AbortController();
    void loadEchoIsland(controller.signal).then((loaded) => {
      setCatalog(loaded);
      setSelection(selectNextEchoSentence(loaded, loaded.progress));
      setStatus("准备好了，先听一遍英文吧。 ");
      setError(null);
    }).catch((loadError) => {
      if (controller.signal.aborted) return;
      setError(friendlyError(loadError, "英语回声岛暂时无法打开。"));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    mainAudioRef.current?.pause();
    if (criticalTimerRef.current !== null) window.clearTimeout(criticalTimerRef.current);
  }, []);

  const applyProgress = useCallback((progress: EchoProgress) => {
    setCatalog((current) => current ? mergeEchoProgress(current, progress) : current);
  }, []);

  const showCritical = () => {
    if (criticalTimerRef.current !== null) window.clearTimeout(criticalTimerRef.current);
    setCriticalVisible(true);
    criticalTimerRef.current = window.setTimeout(() => setCriticalVisible(false), 2_400);
  };

  const completeAndAdvance = async () => {
    if (!catalog || !selection) return;
    setPhase("saving");
    setError(null);
    const eventId = pendingCompletionIdRef.current ?? crypto.randomUUID();
    pendingCompletionIdRef.current = eventId;
    try {
      const completion = await recordEchoCompletion({
        eventId,
        sentenceId: selection.sentence.id,
        mode: selection.mode,
        completedAt: new Date().toISOString(),
      });
      const award = await reward.award(undefined, eventId);
      const nextCatalog = mergeEchoProgress(catalog, completion.progress);
      setCatalog(nextCatalog);
      setSelection(selectNextEchoSentence(nextCatalog, completion.progress, selection.sentence.id));
      setShowChinese(false);
      setPhase("english-ready");
      pendingCompletionIdRef.current = null;
      if (award.criticalHit) {
        showCritical();
        setStatus("知识币暴击！这一句获得 5 个知识币。 ");
      } else if (completion.poolChange) {
        setStatus("这句已经学会啦！学习池已自动换入一条练习次数最低的新句子。 ");
      } else {
        setStatus(selection.mode === "review" ? "温习完成，回到当前学习池。 " : "完成一遍，获得 1 个知识币。 ");
      }
    } catch (saveError) {
      setError(friendlyError(saveError, "这次学习暂时无法保存，请再点一次。"));
      setPhase("next-ready");
    }
  };

  const handleMainAction = async () => {
    if (!selection || !catalog) return;
    browserTts.stop();
    setError(null);
    if (phase === "english-ready") {
      setPhase("playing-english");
      setStatus("正在播放英文，认真听它的声音和节奏。 ");
      try {
        await playAudio(mainAudioRef, selection.sentence.audio.english);
        setPhase("chinese-ready");
        setStatus("英文听完啦，现在可以揭晓中文。 ");
      } catch (playError) {
        setError(friendlyError(playError, "英文录音暂时无法播放。"));
        setPhase("english-ready");
      }
      return;
    }
    if (phase === "chinese-ready") {
      setShowChinese(true);
      setPhase("playing-chinese");
      setStatus("正在播放中文，把意思和英文声音连起来。 ");
      try {
        await playAudio(mainAudioRef, selection.sentence.audio.chinese);
        setPhase("next-ready");
        setStatus("中英文都听完啦，完成这句就能收下知识币。 ");
      } catch (playError) {
        setError(friendlyError(playError, "中文录音暂时无法播放。"));
        setPhase("chinese-ready");
      }
      return;
    }
    if (phase === "next-ready") await completeAndAdvance();
  };

  const isBusy = phase === "playing-english" || phase === "playing-chinese" || phase === "saving";
  const currentCount = catalog && selection
    ? completionCount(catalog.progress, selection.sentence.id)
    : 0;

  if (!catalog || !selection) {
    return (
      <div className="echo-page echo-loading" data-skip-startup-greeting>
        <div className="echo-stars" aria-hidden="true" />
        <section role={error ? "alert" : "status"}>
          <span aria-hidden="true">◌</span>
          <strong>{error ?? "正在把 1000 句真人录音搬上回声岛…"}</strong>
          {error && <button type="button" onClick={() => window.location.reload()}>重新打开</button>}
        </section>
      </div>
    );
  }

  return (
    <div className="echo-page" data-skip-startup-greeting>
      <div className="echo-stars" aria-hidden="true" />
      <header className="echo-topbar">
        <button type="button" className="echo-back" disabled={isBusy} onClick={() => { window.location.href = "/"; }}>
          <span aria-hidden="true">←</span> 返回学习岛
        </button>
        <div className="echo-heading">
          <span className="echo-kicker">真人声音 · 听懂一整句</span>
          <h1>英语回声岛</h1>
        </div>
        <button type="button" className="echo-library-launcher" disabled={isBusy} onClick={() => setLibraryOpen(true)}>
          <span aria-hidden="true">☷</span>
          <span><strong>全部句子</strong><small>{catalog.counts.sentences} 句</small></span>
        </button>
      </header>

      <main className="echo-stage">
        <div className="echo-orbit echo-orbit-one" aria-hidden="true" />
        <div className="echo-orbit echo-orbit-two" aria-hidden="true" />
        <section className="echo-sentence-card" data-no-ui-translation>
          <div className="echo-card-meta">
            <span className={`echo-mode-chip mode-${selection.mode}`}>
              {selection.mode === "review" ? "温习回声" : "当前学习池"}
            </span>
            <span>{currentCount >= catalog.learningRules.masteryCompletionCount ? "已学会" : `${currentCount} / ${catalog.learningRules.masteryCompletionCount} 次`}</span>
          </div>
          <p className="echo-topic">第 {selection.sentence.topic.lesson} 课 · {selection.sentence.topic.chinese}</p>
          <h2>{selection.sentence.english}</h2>
          <div className={`echo-translation ${showChinese ? "is-visible" : ""}`} aria-live="polite">
            {showChinese ? (
              <p>{selection.sentence.chinese}</p>
            ) : (
              <span><i aria-hidden="true">✦</i> 先听英文，下一步再揭晓中文</span>
            )}
          </div>
          <div className="echo-step-dots" aria-label={`当前步骤：${phaseHint(phase)}`}>
            <span className="is-done">1<i>听英文</i></span>
            <b aria-hidden="true" />
            <span className={showChinese ? "is-done" : phase === "chinese-ready" ? "is-current" : ""}>2<i>听中文</i></span>
            <b aria-hidden="true" />
            <span className={phase === "next-ready" || phase === "saving" ? "is-current" : ""}>3<i>下一句</i></span>
          </div>
          <button
            type="button"
            className={`echo-main-button phase-${phase}`}
            disabled={isBusy}
            onClick={() => void handleMainAction()}
          >
            <span className="echo-play-symbol" aria-hidden="true">{phase === "next-ready" ? "→" : phase === "saving" ? "◌" : "▶"}</span>
            <span><strong>{phaseLabel(phase)}</strong><small>{phaseHint(phase)}</small></span>
          </button>
          <p className="echo-status" aria-live="polite">{error ? <strong>{error}</strong> : status}</p>
        </section>

        <aside className="echo-pool-summary" aria-label="学习池状态">
          <span><strong>{catalog.progress.markedSentenceIds.length}</strong>句在学习池</span>
          <span><strong>{catalog.progress.masteredSentenceCount}</strong>句已学会</span>
          <span><strong>{catalog.progress.totalCompletions}</strong>次完整练习</span>
        </aside>
      </main>

      {libraryOpen && (
        <SentenceLibrary
          catalog={catalog}
          onClose={() => setLibraryOpen(false)}
          onProgress={applyProgress}
        />
      )}

      {criticalVisible && (
        <div className="echo-critical" role="status" aria-live="assertive">
          <img src="/images/english/echo-island/knowledge-coin-critical-frame.png" alt="" />
          <div><span>五倍惊喜</span><strong>知识币暴击</strong><b>+5 知识币</b></div>
        </div>
      )}
    </div>
  );
}
