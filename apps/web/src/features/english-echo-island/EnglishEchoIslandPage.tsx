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
  appendEchoSelectionHistory,
  completionCount,
  mergeEchoProgress,
  selectNextEchoSentence,
  takePreviousEchoSelection,
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
type AutoPlayState = "off" | "running" | "stopping";
type AutoPlayQuota = {
  batchId: string;
  limit: 20;
  awardedCoins: number;
  remainingCoins: number;
  exhausted: boolean;
};

const AUTO_PLAY_REWARD_LIMIT = 20 as const;

function createAutoPlayQuota(batchId = crypto.randomUUID()): AutoPlayQuota {
  return {
    batchId,
    limit: AUTO_PLAY_REWARD_LIMIT,
    awardedCoins: 0,
    remainingCoins: AUTO_PLAY_REWARD_LIMIT,
    exhausted: false,
  };
}

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
  const [selectionHistory, setSelectionHistory] = useState<EchoSelection[]>([]);
  const [phase, setPhase] = useState<PlaybackPhase>("english-ready");
  const [showChinese, setShowChinese] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [status, setStatus] = useState("正在准备真人录音…");
  const [error, setError] = useState<string | null>(null);
  const [criticalVisible, setCriticalVisible] = useState(false);
  const [autoPlayState, setAutoPlayState] = useState<AutoPlayState>("off");
  const [autoPlayQuota, setAutoPlayQuota] = useState<AutoPlayQuota | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingCompletionIdRef = useRef<string | null>(null);
  const criticalTimerRef = useRef<number | null>(null);
  const autoPlayEnabledRef = useRef(false);
  const autoPlayBatchIdRef = useRef<string | null>(null);
  const autoPlayRunRef = useRef<Promise<void> | null>(null);
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
    autoPlayEnabledRef.current = false;
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

  const playEnglish = async (activeSelection: EchoSelection) => {
    setPhase("playing-english");
    setStatus("正在播放英文，认真听它的声音和节奏。 ");
    try {
      await playAudio(mainAudioRef, activeSelection.sentence.audio.english);
      setPhase("chinese-ready");
      setStatus("英文听完啦，现在可以揭晓中文。 ");
      return true;
    } catch (playError) {
      setError(friendlyError(playError, "英文录音暂时无法播放。"));
      setPhase("english-ready");
      return false;
    }
  };

  const playChinese = async (activeSelection: EchoSelection) => {
    setShowChinese(true);
    setPhase("playing-chinese");
    setStatus("正在播放中文，把意思和英文声音连起来。 ");
    try {
      await playAudio(mainAudioRef, activeSelection.sentence.audio.chinese);
      setPhase("next-ready");
      setStatus("中英文都听完啦，完成这句就能收下知识币。 ");
      return true;
    } catch (playError) {
      setError(friendlyError(playError, "中文录音暂时无法播放。"));
      setPhase("chinese-ready");
      return false;
    }
  };

  const completeAndAdvance = async (
    activeCatalog: EchoCatalog,
    activeSelection: EchoSelection,
    autoPlayBatchId?: string,
  ) => {
    setPhase("saving");
    setError(null);
    const eventId = pendingCompletionIdRef.current ?? crypto.randomUUID();
    pendingCompletionIdRef.current = eventId;
    try {
      const completion = await recordEchoCompletion({
        eventId,
        sentenceId: activeSelection.sentence.id,
        mode: activeSelection.mode,
        completedAt: new Date().toISOString(),
      });
      const award = await reward.award(
        undefined,
        eventId,
        autoPlayBatchId ? { autoPlayBatchId } : {},
      );
      if (
        award.autoPlayQuota &&
        autoPlayBatchIdRef.current === award.autoPlayQuota.batchId
      ) {
        setAutoPlayQuota(award.autoPlayQuota);
      }
      const nextCatalog = mergeEchoProgress(activeCatalog, completion.progress);
      const nextSelection = selectNextEchoSentence(
        nextCatalog,
        completion.progress,
        activeSelection.sentence.id,
      );
      setCatalog(nextCatalog);
      setSelectionHistory((current) =>
        appendEchoSelectionHistory(current, activeSelection),
      );
      setSelection(nextSelection);
      setShowChinese(false);
      setPhase("english-ready");
      pendingCompletionIdRef.current = null;
      if (award.criticalHit) {
        showCritical();
        setStatus("知识币暴击！这一句获得 5 个知识币。 ");
      } else if (award.autoPlayQuota?.exhausted && award.rewardCoins === 0) {
        setStatus("本轮 20 枚知识币已经收满，连续播放会继续。 ");
      } else if (completion.poolChange) {
        setStatus("这句已经学会啦！学习池已自动换入一条练习次数最低的新句子。 ");
      } else if (award.autoPlayQuota) {
        setStatus(`连续播放中，本轮已获得 ${award.autoPlayQuota.awardedCoins} / ${award.autoPlayQuota.limit} 枚知识币。`);
      } else {
        setStatus(activeSelection.mode === "review" ? "温习完成，回到当前学习池。 " : "完成一遍，获得 1 个知识币。 ");
      }
      return { catalog: nextCatalog, selection: nextSelection };
    } catch (saveError) {
      setError(friendlyError(saveError, "这次学习暂时无法保存，请再点一次。"));
      setPhase("next-ready");
      return null;
    }
  };

  const handleMainAction = async () => {
    if (!selection || !catalog) return;
    browserTts.stop();
    setError(null);
    if (phase === "english-ready") {
      await playEnglish(selection);
      return;
    }
    if (phase === "chinese-ready") {
      await playChinese(selection);
      return;
    }
    if (phase === "next-ready") await completeAndAdvance(catalog, selection);
  };

  const runContinuousPlayback = async (
    initialCatalog: EchoCatalog,
    initialSelection: EchoSelection,
    initialPhase: PlaybackPhase,
  ) => {
    let activeCatalog = initialCatalog;
    let activeSelection = initialSelection;
    let activePhase = initialPhase;
    try {
      while (autoPlayEnabledRef.current) {
        if (activePhase === "english-ready") {
          if (!await playEnglish(activeSelection)) break;
          activePhase = "chinese-ready";
        }
        if (!autoPlayEnabledRef.current) break;
        if (activePhase === "chinese-ready") {
          if (!await playChinese(activeSelection)) break;
          activePhase = "next-ready";
        }
        if (!autoPlayEnabledRef.current) break;
        if (activePhase === "next-ready") {
          const advanced = await completeAndAdvance(
            activeCatalog,
            activeSelection,
            autoPlayBatchIdRef.current ?? undefined,
          );
          if (!advanced) break;
          activeCatalog = advanced.catalog;
          activeSelection = advanced.selection;
          activePhase = "english-ready";
        }
      }
    } finally {
      autoPlayEnabledRef.current = false;
      autoPlayRunRef.current = null;
      setAutoPlayState("off");
      setStatus((current) => current.includes("暂时")
        ? current
        : "连续播放已停止，可以手动继续当前步骤。 ");
    }
  };

  const startContinuousPlayback = () => {
    if (!catalog || !selection || autoPlayRunRef.current) return;
    browserTts.stop();
    setError(null);
    let quota = autoPlayQuota;
    if (!quota) {
      quota = createAutoPlayQuota();
      autoPlayBatchIdRef.current = quota.batchId;
      setAutoPlayQuota(quota);
    }
    autoPlayBatchIdRef.current = quota.batchId;
    autoPlayEnabledRef.current = true;
    setAutoPlayState("running");
    setStatus(quota.exhausted
      ? "连续播放已开启；本轮额度已满，播放会继续但暂不增加知识币。"
      : "连续播放已开启，英文和中文会自动接着播放。 ");
    const run = runContinuousPlayback(catalog, selection, phase);
    autoPlayRunRef.current = run;
    void run;
  };

  const stopContinuousPlayback = () => {
    autoPlayEnabledRef.current = false;
    setAutoPlayState("stopping");
    setStatus("会在当前这段真人录音自然结束后停止。 ");
  };

  const refreshAutoPlayQuota = () => {
    const quota = createAutoPlayQuota();
    autoPlayBatchIdRef.current = quota.batchId;
    setAutoPlayQuota(quota);
    setStatus("新一轮 20 枚知识币额度已准备好，连续播放没有停止。 ");
  };

  const isBusy = phase === "playing-english" || phase === "playing-chinese" || phase === "saving";
  const autoPlayActive = autoPlayState !== "off";
  const navigationLocked = isBusy || autoPlayActive;
  const currentCount = catalog && selection
    ? completionCount(catalog.progress, selection.sentence.id)
    : 0;
  const previousSelection = selectionHistory[selectionHistory.length - 1] ?? null;

  const returnToPreviousSentence = () => {
    if (navigationLocked) return;
    const previous = takePreviousEchoSelection(selectionHistory);
    if (!previous.selection) return;
    browserTts.stop();
    pendingCompletionIdRef.current = null;
    setSelectionHistory(previous.remainingHistory);
    setSelection(previous.selection);
    setShowChinese(false);
    setPhase("english-ready");
    setCriticalVisible(false);
    setError(null);
    setStatus("已经回到上一句，先重新听一遍英文吧。 ");
  };

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
        <button type="button" className="echo-back" disabled={navigationLocked} onClick={() => { window.location.href = "/"; }}>
          <span aria-hidden="true">←</span> 返回学习岛
        </button>
        <div className="echo-heading">
          <span className="echo-kicker">真人声音 · 听懂一整句</span>
          <h1>英语回声岛</h1>
        </div>
        <button type="button" className="echo-library-launcher" disabled={navigationLocked} onClick={() => setLibraryOpen(true)}>
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
          <div className="echo-sentence-navigation">
            <button
              type="button"
              className="echo-previous-sentence"
              disabled={!previousSelection || navigationLocked}
              aria-label={previousSelection
                ? "返回上一句，从播放英文重新开始"
                : "返回上一句，当前还没有上一句"}
              onClick={returnToPreviousSentence}
            >
              <span aria-hidden="true">↶</span>
              <span>
                <strong>返回上一句</strong>
                <small>{previousSelection ? "重新从听英文开始" : "还没有可以返回的句子"}</small>
              </span>
            </button>
          </div>
          <div className={`echo-autoplay-panel ${autoPlayActive ? "is-active" : ""}`}>
            <button
              type="button"
              className="echo-autoplay-toggle"
              aria-pressed={autoPlayActive}
              disabled={autoPlayState === "stopping" || (autoPlayState === "off" && isBusy)}
              onClick={autoPlayState === "running" ? stopContinuousPlayback : startContinuousPlayback}
            >
              <span aria-hidden="true">∞</span>
              <span>
                <strong>{autoPlayState === "running" ? "停止连续播放" : autoPlayState === "stopping" ? "正在结束本句…" : "连续自动播放"}</strong>
                <small>{autoPlayState === "off" ? "英文、中文和下一句自动接着播放" : "每轮最多获得 20 枚知识币"}</small>
              </span>
            </button>
            {autoPlayQuota && (
              <div className={`echo-autoplay-quota ${autoPlayQuota.exhausted ? "is-exhausted" : ""}`}>
                <div aria-live="polite">
                  <span>本轮知识币</span>
                  <strong>{autoPlayQuota.awardedCoins} / {autoPlayQuota.limit}</strong>
                </div>
                <progress max={autoPlayQuota.limit} value={autoPlayQuota.awardedCoins} aria-label={`本轮已获得 ${autoPlayQuota.awardedCoins} 枚，最多 ${autoPlayQuota.limit} 枚`} />
                {autoPlayQuota.exhausted ? (
                  <button type="button" onClick={refreshAutoPlayQuota}>继续获取知识币</button>
                ) : (
                  <small>还可以获得 {autoPlayQuota.remainingCoins} 枚</small>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`echo-main-button phase-${phase}`}
            disabled={isBusy || autoPlayActive}
            onClick={() => void handleMainAction()}
          >
            <span className="echo-play-symbol" aria-hidden="true">{phase === "next-ready" ? "→" : phase === "saving" ? "◌" : "▶"}</span>
            <span>
              <strong>{autoPlayState === "running" ? "连续播放进行中" : autoPlayState === "stopping" ? "本句结束后停止" : phaseLabel(phase)}</strong>
              <small>{autoPlayActive ? "当前步骤完成后会自动继续" : phaseHint(phase)}</small>
            </span>
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
