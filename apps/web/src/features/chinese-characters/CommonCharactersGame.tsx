import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import characterAsset from "../../../../../content/chinese/common-characters.v1.json";
import {
  ASR_SESSION_LIMIT_MINUTES,
  AsrRecognitionSession,
  readAsrConfiguration,
  type RecognitionState,
} from "../add-subtract/asr-client";
import {
  detectCharacterVoiceCommand,
  mergeProgressRecord,
  poolSizeFromPath,
  selectAdaptiveCharacters,
  summarizeRound,
  type CharacterProgressFile,
  type CharacterProgressRecord,
  type CommonCharacter,
  type ExerciseCount,
  type RoundResult,
} from "./logic";
import "./common-characters.css";

type GamePhase = "setup" | "learning" | "summary";
type VoiceDisplayState = RecognitionState | "idle" | "unconfigured";
type RevealStage = 0 | 1 | 2;
type ProgressFilter = "all" | "new" | "learning" | "known";

const ALL_CHARACTERS = characterAsset.characters as CommonCharacter[];
const EMPTY_PROGRESS: CharacterProgressFile = {
  schemaVersion: 1,
  id: "00000000-0000-0000-0000-000000000000",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  records: [],
};
const LIST_PAGE_SIZE = 40;

function voiceLabel(state: VoiceDisplayState) {
  const labels: Record<VoiceDisplayState, string> = {
    idle: "语音待命",
    unconfigured: "语音未配置",
    connecting: "正在连接",
    listening: "识别中",
    finishing: "正在结束",
    limited: `已到 ${ASR_SESSION_LIMIT_MINUTES} 分钟`,
    stopped: "语音已暂停",
    error: "语音需要检查",
  };
  return labels[state];
}

function progressStatus(record?: CharacterProgressRecord) {
  if (!record) return { key: "new", label: "还没见过" } as const;
  if (record.knownCount > record.notKnownCount) {
    return { key: "known", label: "已经会了" } as const;
  }
  return { key: "learning", label: "继续复习" } as const;
}

function progressCopy(records: readonly CharacterProgressRecord[], poolSize: number) {
  const known = records.filter(
    (record) => record.rank <= poolSize && record.knownCount > record.notKnownCount,
  ).length;
  const learning = records.filter(
    (record) => record.rank <= poolSize && record.knownCount <= record.notKnownCount,
  ).length;
  return {
    known,
    learning,
    newCount: Math.max(0, poolSize - known - learning),
    studied: known + learning,
  };
}

export function CommonCharactersGame() {
  const poolSize = poolSizeFromPath(window.location.pathname);
  const pool = useMemo(
    () => ALL_CHARACTERS.slice(0, poolSize),
    [poolSize],
  );
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [exerciseCount, setExerciseCount] = useState<ExerciseCount>(5);
  const [progress, setProgress] = useState<CharacterProgressFile>(EMPTY_PROGRESS);
  const [progressLoading, setProgressLoading] = useState(true);
  const [round, setRound] = useState<CommonCharacter[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [knownCurrent, setKnownCurrent] = useState(false);
  const [revealStage, setRevealStage] = useState<RevealStage>(0);
  const [feedback, setFeedback] = useState("先认真看看这个字");
  const [saveError, setSaveError] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listFilter, setListFilter] = useState<ProgressFilter>("all");
  const [listPage, setListPage] = useState(1);
  const [voiceState, setVoiceState] = useState<VoiceDisplayState>("idle");
  const [voiceDetail, setVoiceDetail] = useState("正在检查本机语音配置");
  const [transcript, setTranscript] = useState("");
  const [asrConfigured, setAsrConfigured] = useState<boolean | null>(null);
  const [recognitionToken, setRecognitionToken] = useState(0);

  const phaseRef = useRef<GamePhase>("setup");
  const progressRef = useRef<CharacterProgressRecord[]>([]);
  const roundRef = useRef<CommonCharacter[]>([]);
  const currentIndexRef = useRef(0);
  const resultsRef = useRef<RoundResult[]>([]);
  const knownCurrentRef = useRef(false);
  const recordedCurrentRef = useRef(false);
  const recognitionRef = useRef<AsrRecognitionSession | null>(null);
  const consumedCommandsRef = useRef(new Set<string>());

  const currentCharacter = round[currentIndex];
  const stats = useMemo(
    () => progressCopy(progress.records, poolSize),
    [poolSize, progress.records],
  );

  const stopRecognition = useCallback(async () => {
    const session = recognitionRef.current;
    recognitionRef.current = null;
    if (session) await session.stop();
  }, []);

  const persistAttempt = useCallback(
    async (character: CommonCharacter, known: boolean, studiedAt: string) => {
      try {
        const response = await fetch(
          "/api/chinese/common-characters/progress/attempt",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              character: character.character,
              rank: character.rank,
              poolSize,
              known,
              studiedAt,
            }),
          },
        );
        const result = (await response.json()) as {
          record?: CharacterProgressRecord;
          message?: string;
        };
        if (!response.ok || !result.record) {
          throw new Error(result.message ?? "学习记录没有保存成功");
        }
        const records = mergeProgressRecord(progressRef.current, result.record);
        progressRef.current = records;
        setProgress((file) => ({
          ...file,
          updatedAt: result.record!.updatedAt,
          records,
        }));
        setSaveError("");
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "学习记录暂时没有保存成功",
        );
      }
    },
    [poolSize],
  );

  const recordCurrent = useCallback(
    (known: boolean) => {
      if (
        phaseRef.current !== "learning" ||
        recordedCurrentRef.current
      ) {
        return resultsRef.current;
      }
      const character = roundRef.current[currentIndexRef.current];
      if (!character) return resultsRef.current;
      recordedCurrentRef.current = true;
      const result: RoundResult = {
        character,
        known,
        studiedAt: new Date().toISOString(),
      };
      const nextResults = [...resultsRef.current, result];
      resultsRef.current = nextResults;
      setResults(nextResults);
      void persistAttempt(character, known, result.studiedAt);
      return nextResults;
    },
    [persistAttempt],
  );

  const showCurrent = useCallback((index: number) => {
    currentIndexRef.current = index;
    knownCurrentRef.current = false;
    recordedCurrentRef.current = false;
    setCurrentIndex(index);
    setKnownCurrent(false);
    setRevealStage(0);
    setFeedback("先认真看看这个字");
    setTranscript("");
  }, []);

  const startRound = useCallback(() => {
    const nextRound = selectAdaptiveCharacters(
      pool,
      progressRef.current,
      exerciseCount,
    );
    roundRef.current = nextRound;
    resultsRef.current = [];
    phaseRef.current = "learning";
    setRound(nextRound);
    setResults([]);
    setPhase("learning");
    setListOpen(false);
    showCurrent(0);
    setVoiceDetail("可以说“我会了”“下一个”或“详细信息”");
  }, [exerciseCount, pool, showCurrent]);

  const finishRound = useCallback(() => {
    if (phaseRef.current !== "learning") return;
    recordCurrent(knownCurrentRef.current);
    phaseRef.current = "summary";
    setPhase("summary");
    setRevealStage(2);
    setVoiceDetail("这一轮完成啦，说“再来一局”可以继续");
  }, [recordCurrent]);

  const advance = useCallback(() => {
    if (phaseRef.current !== "learning") return;
    recordCurrent(knownCurrentRef.current);
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= roundRef.current.length) {
      phaseRef.current = "summary";
      setPhase("summary");
      setVoiceDetail("这一轮完成啦，说“再来一局”可以继续");
      return;
    }
    showCurrent(nextIndex);
  }, [recordCurrent, showCurrent]);

  const markKnown = useCallback(() => {
    if (
      phaseRef.current !== "learning" ||
      knownCurrentRef.current ||
      recordedCurrentRef.current
    ) {
      return;
    }
    knownCurrentRef.current = true;
    setKnownCurrent(true);
    setRevealStage(2);
    setFeedback("收到！这颗文字星已经点亮");
    recordCurrent(true);
  }, [recordCurrent]);

  const revealAll = useCallback(() => {
    if (phaseRef.current !== "learning") return;
    setRevealStage(2);
    setFeedback("拼音、组词和句子都出现啦");
  }, []);

  const returnToSetup = useCallback(() => {
    phaseRef.current = "setup";
    setPhase("setup");
    setListOpen(false);
    setTranscript("");
    setVoiceDetail("说“开始练习”就可以出发");
  }, []);

  const handleVoiceText = useCallback(
    (text: string, sentenceId: number) => {
      setTranscript(text);
      const command = detectCharacterVoiceCommand(text);
      if (!command) return;
      const fingerprint = `${sentenceId}:${command}`;
      if (consumedCommandsRef.current.has(fingerprint)) return;
      consumedCommandsRef.current.add(fingerprint);

      if (command === "list") {
        setListOpen(true);
        setVoiceDetail("文字清单已经打开，说“返回”可以关闭");
        return;
      }
      if (command === "back") {
        if (listOpen) {
          setListOpen(false);
          setVoiceDetail("已经回到识字画面");
        } else {
          returnToSetup();
        }
        return;
      }
      if (
        command === "restart" ||
        (command === "start" && phaseRef.current !== "learning")
      ) {
        startRound();
        return;
      }
      if (command === "end") {
        finishRound();
        return;
      }
      if (phaseRef.current !== "learning" || listOpen) return;
      if (command === "known") markKnown();
      if (command === "next") advance();
      if (command === "reveal") revealAll();
    },
    [
      advance,
      finishRound,
      listOpen,
      markKnown,
      returnToSetup,
      revealAll,
      startRound,
    ],
  );

  const openRecognition = useCallback(async () => {
    await stopRecognition();
    if (!asrConfigured) return;
    consumedCommandsRef.current.clear();
    const session = new AsrRecognitionSession({
      onState: (state, detail) => {
        if (recognitionRef.current !== session) return;
        setVoiceState(state);
        setVoiceDetail(detail ?? voiceLabel(state));
      },
      onResult: ({ text, sentenceId }) => {
        if (recognitionRef.current !== session) return;
        handleVoiceText(text, sentenceId);
      },
      onError: (message) => {
        if (recognitionRef.current !== session) return;
        setVoiceState("error");
        setVoiceDetail(message);
      },
    });
    recognitionRef.current = session;
    await session.start();
  }, [asrConfigured, handleVoiceText, stopRecognition]);

  const toggleRecognition = async () => {
    if (
      recognitionRef.current &&
      ["listening", "connecting", "finishing"].includes(voiceState)
    ) {
      await stopRecognition();
      setVoiceState("idle");
      setVoiceDetail("语音已暂停，点击可以继续");
      return;
    }
    setVoiceState("connecting");
    setRecognitionToken((token) => token + 1);
  };

  useEffect(() => {
    void fetch("/api/chinese/common-characters/progress")
      .then(async (response) => {
        const result = (await response.json()) as CharacterProgressFile & {
          message?: string;
        };
        if (!response.ok) throw new Error(result.message ?? "无法读取识字进度");
        progressRef.current = result.records;
        setProgress(result);
      })
      .catch((error) => {
        setSaveError(
          error instanceof Error ? error.message : "无法读取识字进度",
        );
      })
      .finally(() => setProgressLoading(false));

    void readAsrConfiguration()
      .then((configuration) => {
        setAsrConfigured(configuration.isConfigured);
        if (!configuration.isConfigured) {
          setVoiceState("unconfigured");
          setVoiceDetail("请先在功能测试页保存阿里云 API Key");
        }
      })
      .catch(() => {
        setAsrConfigured(false);
        setVoiceState("error");
        setVoiceDetail("无法读取本机语音配置，请确认服务已经启动");
      });
  }, []);

  useEffect(() => {
    if (phase !== "learning") return;
    setRevealStage(0);
    const pinyinTimer = window.setTimeout(
      () => setRevealStage((stage) => (stage < 1 ? 1 : stage)),
      1_700,
    );
    const detailTimer = window.setTimeout(
      () => setRevealStage(2),
      3_900,
    );
    return () => {
      window.clearTimeout(pinyinTimer);
      window.clearTimeout(detailTimer);
    };
  }, [currentIndex, phase]);

  useEffect(() => {
    if (asrConfigured !== true) return;
    void openRecognition();
    return () => {
      void stopRecognition();
    };
  }, [asrConfigured, openRecognition, recognitionToken, stopRecognition]);

  useEffect(
    () => () => {
      void stopRecognition();
    },
    [stopRecognition],
  );

  const progressByCharacter = useMemo(
    () => new Map(progress.records.map((record) => [record.character, record])),
    [progress.records],
  );
  const filteredList = useMemo(() => {
    const search = listSearch.trim().toLowerCase();
    return pool.filter((item) => {
      const record = progressByCharacter.get(item.character);
      const status = progressStatus(record).key;
      const statusMatches = listFilter === "all" || listFilter === status;
      const textMatches =
        !search ||
        item.character.includes(search) ||
        item.pinyin.toLowerCase().includes(search) ||
        item.words.some((word) => word.includes(search));
      return statusMatches && textMatches;
    });
  }, [listFilter, listSearch, pool, progressByCharacter]);
  const listPageCount = Math.max(
    1,
    Math.ceil(filteredList.length / LIST_PAGE_SIZE),
  );
  const visibleList = filteredList.slice(
    (listPage - 1) * LIST_PAGE_SIZE,
    listPage * LIST_PAGE_SIZE,
  );
  const summary = summarizeRound(results);

  useEffect(() => {
    setListPage(1);
  }, [listFilter, listSearch]);

  const voiceButton = (
    <button
      type="button"
      className={`characters-voice voice-${voiceState}`}
      onClick={() => void toggleRecognition()}
      disabled={asrConfigured !== true}
      aria-label={`${voiceLabel(voiceState)}。${voiceDetail}`}
    >
      <i aria-hidden="true" />
      <span>
        <strong>{voiceLabel(voiceState)}</strong>
        <small>
          {voiceState === "limited"
            ? "点击继续识别"
            : voiceState === "listening"
              ? `每段最多 ${ASR_SESSION_LIMIT_MINUTES} 分钟`
              : "点击开启"}
        </small>
      </span>
    </button>
  );

  return (
    <div className={`characters-page phase-${phase}`}>
      <div className="characters-stars" aria-hidden="true" />
      <header className="characters-topbar">
        <a href="/" className="characters-back">← 学习大厅</a>
        <div className="characters-brand">
          <span aria-hidden="true">文</span>
          <div><strong>常用 {poolSize} 字</strong><small>木木的文字星图</small></div>
        </div>
        <div className="characters-top-actions">
          <button
            type="button"
            className="characters-list-button"
            onClick={() => setListOpen(true)}
          >
            文字清单
          </button>
          {voiceButton}
        </div>
      </header>

      {phase === "setup" && (
        <main className="characters-setup-main">
          <section className="characters-intro">
            <p className="characters-eyebrow">CHARACTER CONSTELLATION · 文字星图</p>
            <h1>一个字一个字，<em>把故事读进心里。</em></h1>
            <p>
              先看汉字，再看拼音、组词和句子。会了就说“我会了”，
              还没会的字会更常回来和木木见面。
            </p>
            <div className="characters-voice-guide">
              <span aria-hidden="true">🎙</span>
              <div>
                <strong>全程可以直接说</strong>
                <p>“开始练习” · “我会了” · “下一个” · “文字清单”</p>
              </div>
            </div>
          </section>

          <section className="characters-console">
            <div className="characters-console-heading">
              <span>本次任务</span>
              <div><h2>要认识几个字？</h2><p>系统会把新字和需要复习的字搭配起来</p></div>
            </div>
            <div className="exercise-count-options">
              {([5, 10] as const).map((count) => (
                <button
                  type="button"
                  key={count}
                  className={exerciseCount === count ? "is-selected" : ""}
                  onClick={() => setExerciseCount(count)}
                  aria-pressed={exerciseCount === count}
                >
                  <span>{exerciseCount === count ? "✓ 已选择" : "选择"}</span>
                  <strong>{count}</strong>
                  <small>个汉字</small>
                </button>
              ))}
            </div>
            <div className="characters-progress-strip">
              <article><span>已经见过</span><strong>{stats.studied}</strong></article>
              <article><span>已经会了</span><strong>{stats.known}</strong></article>
              <article><span>继续复习</span><strong>{stats.learning}</strong></article>
              <article><span>等待探索</span><strong>{stats.newCount}</strong></article>
            </div>
            <button
              type="button"
              className="characters-primary"
              onClick={startRound}
              disabled={progressLoading}
            >
              {progressLoading ? "正在整理文字星图…" : "▶ 开始练习"}
            </button>
            {asrConfigured === false && (
              <a href="/#asr-lab" className="characters-config-link">
                先去配置语音识别 →
              </a>
            )}
          </section>
        </main>
      )}

      {phase === "learning" && currentCharacter && (
        <main className="characters-learning-main">
          <section className="characters-learning-status">
            <div>
              <span>第 {currentIndex + 1} / {round.length} 个字</span>
              <div><i style={{ width: `${((currentIndex + 1) / round.length) * 100}%` }} /></div>
            </div>
            <p aria-live="polite">{transcript ? `刚刚听到：${transcript}` : voiceDetail}</p>
            <button type="button" onClick={finishRound}>结束本轮</button>
          </section>

          <section
            className={`character-stage reveal-${revealStage} ${knownCurrent ? "is-known" : ""}`}
            aria-live="polite"
          >
            <div className="character-orbit orbit-one" aria-hidden="true"><i /><i /><i /></div>
            <div className="character-orbit orbit-two" aria-hidden="true"><i /><i /></div>
            <div className="character-rank">常用字序 · {currentCharacter.rank}</div>
            <div className="character-reading">
              <p className="character-pinyin">{revealStage >= 1 ? currentCharacter.pinyin : "· · ·"}</p>
              <h1>{currentCharacter.character}</h1>
              <div className="character-meta">
                <span>部首 {currentCharacter.radical}</span>
                <span>{currentCharacter.strokes} 画</span>
              </div>
            </div>
            <div className="character-knowledge">
              <p className="character-meaning">
                {revealStage >= 2 ? currentCharacter.meaning : "再看一会儿，词语和句子马上出现…"}
              </p>
              <div className="character-words" aria-label="组词">
                {currentCharacter.words.map((word) => <span key={word}>{revealStage >= 2 ? word : "＊＊"}</span>)}
              </div>
              <blockquote>
                {revealStage >= 2 ? currentCharacter.sentence : "句子正在穿过星光来到这里。"}
              </blockquote>
              <div className="character-idioms">
                {revealStage >= 2 && currentCharacter.idioms.length > 0 ? (
                  currentCharacter.idioms.map((idiom) => (
                    <span key={idiom.word} title={idiom.meaning}>{idiom.word}</span>
                  ))
                ) : (
                  <span>{revealStage >= 2 ? "这个字没有常用成语，记住组词就很棒" : "成语 · 即将出现"}</span>
                )}
              </div>
            </div>
            {knownCurrent && <div className="known-star">✓ 我会了</div>}
          </section>

          <section className="character-actions">
            <div className="character-feedback">
              <i aria-hidden="true" />
              <span><strong>{feedback}</strong><small>没说“我会了”的字，会放进复习队伍</small></span>
            </div>
            <button
              type="button"
              className="character-reveal-button"
              onClick={revealAll}
              disabled={revealStage === 2}
            >
              看拼音和词语
            </button>
            <button
              type="button"
              className={`character-known-button ${knownCurrent ? "is-active" : ""}`}
              onClick={markKnown}
              disabled={knownCurrent}
            >
              {knownCurrent ? "✓ 已经点亮" : "✓ 我会了"}
            </button>
            <button type="button" className="character-next-button" onClick={advance}>
              {currentIndex + 1 === round.length ? "完成本轮 →" : "下一个 →"}
            </button>
          </section>
        </main>
      )}

      {phase === "summary" && (
        <main className="characters-summary-main">
          <section className="characters-summary-hero">
            <span>ROUND COMPLETE · 文字星光已收好</span>
            <h1>{summary.studiedCount} 个字，<em>都认真看过了。</em></h1>
            <p>
              点亮了 {summary.knownCount} 颗“我会了”文字星，
              还有 {summary.reviewCount} 个字会放进之后的复习队伍。
            </p>
          </section>
          <section className="characters-result-grid">
            {results.map((result, index) => (
              <article className={result.known ? "is-known" : "is-review"} key={`${result.character.character}-${index}`}>
                <span>{index + 1}</span>
                <strong>{result.character.character}</strong>
                <div><b>{result.character.pinyin}</b><small>{result.known ? "✓ 我会了" : "再见几次就熟悉啦"}</small></div>
              </article>
            ))}
          </section>
          <div className="characters-summary-actions">
            <button type="button" className="characters-primary" onClick={startRound}>↻ 再来一局</button>
            <button type="button" className="characters-secondary" onClick={returnToSetup}>调整数量</button>
            <button type="button" className="characters-secondary" onClick={() => setListOpen(true)}>查看文字清单</button>
          </div>
        </main>
      )}

      {saveError && <div className="characters-save-error" role="alert">{saveError}</div>}

      {listOpen && (
        <div className="character-list-overlay" role="dialog" aria-modal="true" aria-labelledby="character-list-title">
          <section className="character-list-panel">
            <header>
              <div><span>LEARNING MAP · 频率顺序</span><h2 id="character-list-title">木木的 {poolSize} 字清单</h2></div>
              <button type="button" onClick={() => setListOpen(false)} aria-label="关闭文字清单">×</button>
            </header>
            <div className="character-list-tools">
              <label>
                <span>找一个字、拼音或词语</span>
                <input value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder="例如：木、mù、木头" />
              </label>
              <div aria-label="学习状态筛选">
                {([
                  ["all", "全部"],
                  ["new", "没见过"],
                  ["learning", "继续复习"],
                  ["known", "已经会了"],
                ] as const).map(([key, label]) => (
                  <button type="button" key={key} className={listFilter === key ? "is-selected" : ""} onClick={() => setListFilter(key)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="character-list-table" role="table" aria-label="汉字学习记录">
              <div className="character-list-row character-list-head" role="row">
                <span>顺序</span><span>汉字</span><span>拼音与组词</span><span>学过</span><span>我会了</span><span>继续复习</span><span>状态</span>
              </div>
              {visibleList.map((item) => {
                const record = progressByCharacter.get(item.character);
                const status = progressStatus(record);
                return (
                  <div className={`character-list-row status-${status.key}`} role="row" key={item.character}>
                    <span>{item.rank}</span>
                    <strong>{item.character}</strong>
                    <span><b>{item.pinyin}</b><small>{item.words.slice(0, 2).join(" · ")}</small></span>
                    <span>{record?.studiedCount ?? 0}</span>
                    <span>{record?.knownCount ?? 0}</span>
                    <span>{record?.notKnownCount ?? 0}</span>
                    <span><i />{status.label}</span>
                  </div>
                );
              })}
              {visibleList.length === 0 && <div className="character-list-empty">没有找到符合条件的字，换一个筛选试试。</div>}
            </div>
            <footer>
              <span>共 {filteredList.length} 个字 · 第 {listPage} / {listPageCount} 页</span>
              <div>
                <button type="button" onClick={() => setListPage((page) => Math.max(1, page - 1))} disabled={listPage === 1}>上一页</button>
                <button type="button" onClick={() => setListPage((page) => Math.min(listPageCount, page + 1))} disabled={listPage === listPageCount}>下一页</button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
