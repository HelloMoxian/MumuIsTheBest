import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AsrRecognitionSession,
  readAsrConfiguration,
  type RecognitionState,
} from "../add-subtract/asr-client";
import { NumberLineCanvas } from "./NumberLineCanvas";
import {
  applyGuess,
  approximateQuestionsRemaining,
  detectVoiceGameCommand,
  formatInteger,
  generateSecret,
  parseGuessQuery,
  queryLabel,
  rangeMidpoint,
  rangeSize,
  type CandidateRange,
  type GuessKind,
  type GuessOutcome,
  type GuessQuery,
  type NumberRangeMaximum,
} from "./logic";
import "./find-number.css";

type GamePhase = "setup" | "playing" | "completed" | "ended";
type VoiceDisplayState = RecognitionState | "idle" | "unconfigured";

type GuessAttempt = GuessOutcome & {
  id: string;
  heardText: string;
  elapsedMs: number;
  cumulativeExcluded: number;
};

const RANGE_OPTIONS: readonly {
  maximum: NumberRangeMaximum;
  label: string;
  caption: string;
  stars: number;
}[] = [
  { maximum: 100, label: "0—100", caption: "先认识两位数的方向", stars: 1 },
  { maximum: 1_000, label: "0—1,000", caption: "在一千颗数字星里寻找", stars: 2 },
  { maximum: 10_000, label: "0—10,000", caption: "让万以内的数排好队", stars: 3 },
  { maximum: 100_000, label: "0—100,000", caption: "挑战十万以内的大数", stars: 4 },
] as const;

const MANUAL_RELATIONS: readonly { kind: GuessKind; label: string; symbol: string }[] = [
  { kind: "exact", label: "是这个数吗", symbol: "=" },
  { kind: "less-than", label: "比它小吗", symbol: "<" },
  { kind: "greater-than", label: "比它大吗", symbol: ">" },
] as const;

function voiceLabel(state: VoiceDisplayState) {
  const labels: Record<VoiceDisplayState, string> = {
    idle: "语音待命",
    connecting: "正在连接",
    listening: "正在听",
    finishing: "正在收尾",
    limited: "本段已到 2 分钟",
    stopped: "语音已停止",
    error: "语音需要检查",
    unconfigured: "需要配置语音",
  };
  return labels[state];
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0
    ? `${minutes} 分 ${String(seconds % 60).padStart(2, "0")} 秒`
    : `${seconds} 秒`;
}

export function FindNumberGame() {
  const [rangeMaximum, setRangeMaximum] = useState<NumberRangeMaximum>(100);
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [secret, setSecret] = useState(0);
  const [candidates, setCandidates] = useState<CandidateRange>({ minimum: 0, maximum: 100 });
  const [attempts, setAttempts] = useState<GuessAttempt[]>([]);
  const [lastOutcome, setLastOutcome] = useState<GuessOutcome | null>(null);
  const [manualKind, setManualKind] = useState<GuessKind>("exact");
  const [manualValue, setManualValue] = useState(50);
  const [pulseKey, setPulseKey] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalDurationMs, setFinalDurationMs] = useState(0);
  const [voiceState, setVoiceState] = useState<VoiceDisplayState>("idle");
  const [voiceDetail, setVoiceDetail] = useState("可以说“开始一局”");
  const [transcript, setTranscript] = useState("");
  const [asrConfigured, setAsrConfigured] = useState<boolean | null>(null);
  const [recognitionToken, setRecognitionToken] = useState(0);

  const phaseRef = useRef<GamePhase>("setup");
  const rangeMaximumRef = useRef<NumberRangeMaximum>(100);
  const secretRef = useRef(0);
  const candidatesRef = useRef<CandidateRange>({ minimum: 0, maximum: 100 });
  const attemptsRef = useRef<GuessAttempt[]>([]);
  const roundStartedAtRef = useRef(0);
  const recognitionRef = useRef<AsrRecognitionSession | null>(null);

  const midpoint = rangeMidpoint(candidates);
  const remainingCount = rangeSize(candidates);
  const excludedCount = rangeMaximum + 1 - remainingCount;
  const suggestedQuestions = approximateQuestionsRemaining(candidates);

  const stopRecognition = useCallback(async () => {
    const current = recognitionRef.current;
    recognitionRef.current = null;
    if (current) await current.stop();
  }, []);

  const startRound = useCallback(async () => {
    await stopRecognition();
    const maximum = rangeMaximumRef.current;
    const nextSecret = generateSecret(maximum);
    const nextRange = { minimum: 0, maximum };
    const now = Date.now();
    secretRef.current = nextSecret;
    candidatesRef.current = nextRange;
    attemptsRef.current = [];
    roundStartedAtRef.current = now;
    phaseRef.current = "playing";
    setSecret(nextSecret);
    setCandidates(nextRange);
    setAttempts([]);
    setLastOutcome(null);
    setManualKind("exact");
    setManualValue(rangeMidpoint(nextRange));
    setElapsedMs(0);
    setFinalDurationMs(0);
    setTranscript("");
    setPulseKey((key) => key + 1);
    setPhase("playing");
    setVoiceDetail("开始提问吧，例如“是五十吗”或“小于八十吗”");
    setRecognitionToken((token) => token + 1);
  }, [stopRecognition]);

  const finishRoundEarly = useCallback(async () => {
    if (phaseRef.current !== "playing") return;
    const duration = Math.max(0, Date.now() - roundStartedAtRef.current);
    phaseRef.current = "ended";
    setFinalDurationMs(duration);
    setPhase("ended");
    setVoiceDetail("这一局已经结束，说“下一局”可以继续");
    setPulseKey((key) => key + 1);
    await stopRecognition();
  }, [stopRecognition]);

  const handleGuess = useCallback((query: GuessQuery, heardText = "") => {
    if (phaseRef.current !== "playing") return;
    const maximum = rangeMaximumRef.current;
    const outcome = applyGuess(candidatesRef.current, secretRef.current, query);
    const attempt: GuessAttempt = {
      ...outcome,
      id: `guess-${attemptsRef.current.length + 1}-${Date.now()}`,
      heardText: heardText || queryLabel(query),
      elapsedMs: Math.max(0, Date.now() - roundStartedAtRef.current),
      cumulativeExcluded: maximum + 1 - outcome.remainingCount,
    };
    const nextAttempts = [...attemptsRef.current, attempt];
    attemptsRef.current = nextAttempts;
    candidatesRef.current = outcome.after;
    setAttempts(nextAttempts);
    setCandidates(outcome.after);
    setLastOutcome(outcome);
    setManualValue(rangeMidpoint(outcome.after));
    setPulseKey((key) => key + 1);
    if (outcome.solved) {
      const duration = Math.max(0, Date.now() - roundStartedAtRef.current);
      phaseRef.current = "completed";
      setFinalDurationMs(duration);
      setPhase("completed");
      setVoiceDetail("通关啦！说“下一局”可以再找一个");
      void stopRecognition();
    }
  }, [stopRecognition]);

  const processVoiceText = useCallback((text: string, isFinal: boolean) => {
    setTranscript(text);
    if (!isFinal) return;
    const command = detectVoiceGameCommand(text);
    const currentPhase = phaseRef.current;

    if (
      command === "next"
      || (command === "start" && currentPhase !== "playing")
    ) {
      void startRound();
      return;
    }
    if (command === "end" && currentPhase === "playing") {
      void finishRoundEarly();
      return;
    }
    if (currentPhase !== "playing") return;

    const query = parseGuessQuery(text);
    if (query) {
      handleGuess(query, text);
    } else {
      setVoiceDetail("我听到了声音，但还没找到数字。试试说“是五百吗”。");
    }
  }, [finishRoundEarly, handleGuess, startRound]);

  const openRecognition = useCallback(async () => {
    await stopRecognition();
    if (!asrConfigured) return;
    setTranscript("");
    const session = new AsrRecognitionSession({
      onState: (state, detail) => {
        if (recognitionRef.current !== session) return;
        setVoiceState(state);
        setVoiceDetail(detail ?? voiceLabel(state));
      },
      onResult: ({ text, isFinal }) => {
        if (recognitionRef.current !== session) return;
        processVoiceText(text, isFinal);
      },
      onError: (message) => {
        if (recognitionRef.current !== session) return;
        setVoiceState("error");
        setVoiceDetail(message);
      },
    });
    recognitionRef.current = session;
    await session.start();
  }, [asrConfigured, processVoiceText, stopRecognition]);

  useEffect(() => {
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
    if (asrConfigured !== true) return;
    void openRecognition();
    return () => {
      void stopRecognition();
    };
  }, [asrConfigured, openRecognition, phase, recognitionToken, stopRecognition]);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - roundStartedAtRef.current));
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(
    () => () => {
      void stopRecognition();
    },
    [stopRecognition],
  );

  const selectRange = (maximum: NumberRangeMaximum) => {
    if (phase !== "setup") return;
    rangeMaximumRef.current = maximum;
    setRangeMaximum(maximum);
    setCandidates({ minimum: 0, maximum });
    setManualValue(Math.floor(maximum / 2));
  };

  const submitManualGuess = (event: FormEvent) => {
    event.preventDefault();
    const value = Math.min(rangeMaximum, Math.max(0, Math.round(manualValue)));
    handleGuess({ kind: manualKind, value, rawText: queryLabel({ kind: manualKind, value }) });
  };

  const toggleRecognition = async () => {
    if (
      recognitionRef.current
      && (voiceState === "listening" || voiceState === "connecting" || voiceState === "finishing")
    ) {
      await stopRecognition();
      setVoiceState("idle");
      setVoiceDetail("语音已暂停，点击可以继续");
      return;
    }
    setVoiceState("connecting");
    setRecognitionToken((token) => token + 1);
  };

  const returnToSetup = async () => {
    await stopRecognition();
    phaseRef.current = "setup";
    setPhase("setup");
    setLastOutcome(null);
    setAttempts([]);
    attemptsRef.current = [];
    setTranscript("");
    setRecognitionToken((token) => token + 1);
  };

  const recentAttempts = useMemo(() => [...attempts].reverse(), [attempts]);
  const resultReached = phase === "completed" || phase === "ended";

  if (phase === "setup") {
    return (
      <div className="find-number-page find-number-setup">
        <div className="find-number-stars" aria-hidden="true" />
        <header className="find-number-topbar">
          <a href="/" className="find-number-back">← 学习大厅</a>
          <div className="find-number-brand"><span aria-hidden="true">⌕</span><strong>找数字</strong></div>
          <button
            type="button"
            className={`find-number-voice voice-${voiceState}`}
            onClick={() => void toggleRecognition()}
            disabled={asrConfigured !== true}
            aria-label={`${voiceLabel(voiceState)}。${voiceDetail}`}
          >
            <i aria-hidden="true" />
            <span><strong>{voiceLabel(voiceState)}</strong><small>{voiceState === "listening" ? "说“开始一局”" : "点击开启"}</small></span>
          </button>
        </header>
        <main className="find-number-setup-main">
          <section className="find-number-setup-copy">
            <p className="find-number-eyebrow">NUMBER RADAR · 数字雷达舱</p>
            <h1>问一问大小，<em>把神秘数字找出来。</em></h1>
            <p className="find-number-lead">
              每次比较都会冻住一大片不可能的数字。
              试着从中间问起，数字藏身的范围会缩得特别快。
            </p>
            <div className="voice-example">
              <span aria-hidden="true">🎙</span>
              <div><strong>可以直接说</strong><p>“开始一局” · “是五十吗” · “小于八十吗”</p></div>
            </div>
          </section>
          <section className="range-console" aria-labelledby="range-title">
            <div className="range-console-heading">
              <span>01</span>
              <div><h2 id="range-title">选择数字范围</h2><p>范围越大，找到它需要更多次观察</p></div>
            </div>
            <div className="range-options">
              {RANGE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.maximum}
                  className={rangeMaximum === option.maximum ? "is-selected" : ""}
                  onClick={() => selectRange(option.maximum)}
                >
                  <span>{rangeMaximum === option.maximum ? "✓ 已选择" : "选择范围"}</span>
                  <strong>{option.label}</strong>
                  <p>{option.caption}</p>
                  <i aria-label={`${option.stars} 颗难度星`}>{"✦".repeat(option.stars)}</i>
                </button>
              ))}
            </div>
            <button type="button" className="find-number-start" onClick={() => void startRound()}>
              <span aria-hidden="true">▶</span> 开始一局
            </button>
            {asrConfigured === false && (
              <a href="/#asr-lab" className="find-number-config-link">先去配置语音识别 →</a>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (resultReached) {
    const solved = phase === "completed";
    const resultCandidates = solved ? { minimum: secret, maximum: secret } : candidates;
    const resultExcluded = solved
      ? rangeMaximum
      : attempts.at(-1)?.cumulativeExcluded ?? 0;
    return (
      <div className={`find-number-page find-number-result ${solved ? "is-solved" : "is-ended"}`}>
        <div className="find-number-stars" aria-hidden="true" />
        <header className="find-number-topbar">
          <a href="/" className="find-number-back">← 学习大厅</a>
          <div className="find-number-brand"><span aria-hidden="true">⌕</span><strong>找数字</strong></div>
          <button
            type="button"
            className={`find-number-voice voice-${voiceState}`}
            onClick={() => void toggleRecognition()}
            disabled={asrConfigured !== true}
          >
            <i aria-hidden="true" /><span><strong>{voiceLabel(voiceState)}</strong><small>说“下一局”</small></span>
          </button>
        </header>
        <main className="find-number-result-main">
          <section className="result-hero">
            <p>{solved ? "MISSION COMPLETE · 数字锁定" : "ROUND COMPLETE · 本局结束"}</p>
            <span className="result-orbit" aria-hidden="true"><i /><i /><i /></span>
            <h1>{formatInteger(secret)}</h1>
            <h2>{solved ? "找到啦！这就是神秘数字" : "这次先到这里，神秘数字揭晓"}</h2>
            <p className="result-message">
              {solved
                ? `木木用了 ${attempts.length} 次提问，让 ${formatInteger(rangeMaximum + 1)} 个候选数字一步步缩成了唯一答案。`
                : `已经完成了 ${attempts.length} 次观察，下次可以试试每次都从剩余范围的中间问起。`}
            </p>
          </section>

          <section className="result-number-line">
            <NumberLineCanvas
              maximum={rangeMaximum}
              candidates={resultCandidates}
              lastEliminated={lastOutcome?.eliminated ?? null}
              pulseKey={pulseKey}
              revealedSecret={secret}
            />
          </section>

          <section className="result-stats" aria-label="本局统计">
            <article><span>提问次数</span><strong>{attempts.length}</strong><small>每一次都让方向更清楚</small></article>
            <article><span>总耗时</span><strong>{formatDuration(finalDurationMs)}</strong><small>没有倒计时，认真想最重要</small></article>
            <article>
              <span>排除数字</span>
              <strong>{formatInteger(resultExcluded)}</strong>
              <small>{solved ? "最后只留下唯一目标" : `当前还保留 ${formatInteger(rangeSize(candidates))} 个候选`}</small>
            </article>
          </section>

          <section className="result-timeline">
            <div className="result-section-heading">
              <div><span>探索记录</span><h2>每一次都问了什么？</h2></div>
              <small>按提问顺序排列</small>
            </div>
            {attempts.length === 0 ? (
              <div className="result-empty"><strong>这一局还没有提问记录</strong><p>下一局从中间数开始试试吧。</p></div>
            ) : (
              <div className="result-attempts">
                {attempts.map((attempt, index) => (
                  <article key={attempt.id}>
                    <span className="attempt-order">{index + 1}</span>
                    <div className="attempt-question"><small>木木问</small><strong>{queryLabel(attempt.query)}</strong><p>{attempt.responseText}</p></div>
                    <div className="attempt-metric"><small>本次新排除</small><strong>{formatInteger(attempt.eliminatedCount)} 个</strong></div>
                    <div className="attempt-metric"><small>累计排除</small><strong>{formatInteger(attempt.cumulativeExcluded)} 个</strong></div>
                    <time>{formatDuration(attempt.elapsedMs)}</time>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="result-actions">
            <button type="button" className="find-number-start" onClick={() => void startRound()}>↻ 下一局</button>
            <button type="button" className="find-number-secondary" onClick={() => void returnToSetup()}>换一个范围</button>
            <a href="/" className="find-number-quiet">回到学习大厅</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="find-number-page find-number-playing">
      <div className="find-number-stars" aria-hidden="true" />
      <header className="find-number-topbar play-topbar">
        <a href="/" className="find-number-back">← 学习大厅</a>
        <div className="find-number-brand"><span aria-hidden="true">⌕</span><strong>找数字</strong></div>
        <div className="play-top-actions">
          <button
            type="button"
            className={`find-number-voice voice-${voiceState}`}
            onClick={() => void toggleRecognition()}
            disabled={asrConfigured !== true}
            aria-label={`${voiceLabel(voiceState)}。${voiceDetail}`}
          >
            <i aria-hidden="true" />
            <span><strong>{voiceLabel(voiceState)}</strong><small>{voiceState === "limited" ? "点击继续" : `上限 2 分钟`}</small></span>
          </button>
          <button type="button" className="end-round-button" onClick={() => void finishRoundEarly()}>结束一局</button>
        </div>
      </header>

      <main className="find-number-game-main">
        <section className="number-radar-panel">
          <div className="radar-heading">
            <div>
              <span>神秘范围 · 0—{formatInteger(rangeMaximum)}</span>
              <h1>{lastOutcome ? lastOutcome.responseText : "一个神秘数字已经藏好了"}</h1>
              <p>
                {lastOutcome
                  ? lastOutcome.eliminatedCount > 0
                    ? `这次新排除了 ${formatInteger(lastOutcome.eliminatedCount)} 个数字。`
                    : "这个问题没有带来新的排除，换一个靠近当前范围的问题吧。"
                  : "说“是中间数吗”，或者问它大于、小于某个数字。"}
              </p>
            </div>
            <div className="mystery-number-orb" aria-label="神秘数字尚未揭晓">
              <i /><i /><i /><strong>?</strong><span>目标数字</span>
            </div>
          </div>

          <div className="number-line-shell">
            <NumberLineCanvas
              maximum={rangeMaximum}
              candidates={candidates}
              lastEliminated={lastOutcome?.eliminated ?? null}
              pulseKey={pulseKey}
              revealedSecret={null}
            />
          </div>

          <div className="range-summary" aria-live="polite">
            <article><span>现在可能在</span><strong>{formatInteger(candidates.minimum)}—{formatInteger(candidates.maximum)}</strong></article>
            <article><span>还剩</span><strong>{formatInteger(remainingCount)} 个</strong></article>
            <article><span>已经排除</span><strong>{formatInteger(excludedCount)} 个</strong></article>
            <article><span>本局用时</span><strong>{formatDuration(elapsedMs)}</strong></article>
          </div>

          <div className="midpoint-guide">
            <span className="midpoint-mark" aria-hidden="true">½</span>
            <div>
              <strong>二分小提示：试试中间数 {formatInteger(midpoint)}</strong>
              <p>
                从中间问，通常一次能排除接近一半。
                现在最多大约再问 {suggestedQuestions} 次就能找到。
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleGuess({ kind: "exact", value: midpoint, rawText: `是${midpoint}吗` }, `点击了中间数 ${midpoint}`)}
            >
              是 {formatInteger(midpoint)} 吗？
            </button>
          </div>

          <form className="manual-question" onSubmit={submitManualGuess}>
            <div className="manual-heading">
              <div><span>也可以点着问</span><strong>选择关系，再放入一个数字</strong></div>
              {transcript && <p className="heard-speech">刚刚听到：{transcript}</p>}
            </div>
            <div className="relation-options">
              {MANUAL_RELATIONS.map((relation) => (
                <button
                  type="button"
                  key={relation.kind}
                  className={manualKind === relation.kind ? "is-selected" : ""}
                  onClick={() => setManualKind(relation.kind)}
                  aria-pressed={manualKind === relation.kind}
                >
                  <span>{relation.symbol}</span>{relation.label}
                </button>
              ))}
            </div>
            <label className="number-input-field">
              <span>我要问的数字</span>
              <input
                type="number"
                min={0}
                max={rangeMaximum}
                step={1}
                value={manualValue}
                onChange={(event) => setManualValue(Number(event.target.value))}
              />
            </label>
            <button type="submit" className="ask-button">问一问 →</button>
          </form>
        </section>

        <aside className="guess-log-panel">
          <div className="guess-log-heading">
            <div><span>探索轨迹</span><h2>已经问了 {attempts.length} 次</h2></div>
            <time>{formatDuration(elapsedMs)}</time>
          </div>
          {recentAttempts.length === 0 ? (
            <div className="guess-log-empty">
              <span aria-hidden="true">⌁</span>
              <strong>第一条线索正在等你</strong>
              <p>试试问“是 {formatInteger(midpoint)} 吗？”</p>
            </div>
          ) : (
            <ol className="guess-log-list">
              {recentAttempts.map((attempt, reverseIndex) => {
                const order = attempts.length - reverseIndex;
                return (
                  <li key={attempt.id} className={attempt.solved ? "is-solved" : ""}>
                    <span>{order}</span>
                    <div>
                      <small>木木问 · {formatDuration(attempt.elapsedMs)}</small>
                      <strong>{queryLabel(attempt.query)}</strong>
                      <p>{attempt.responseText}</p>
                      <footer>
                        <b>新排除 {formatInteger(attempt.eliminatedCount)} 个</b>
                        <em>还剩 {formatInteger(attempt.remainingCount)} 个</em>
                      </footer>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className={`voice-detail-card voice-${voiceState}`}>
            <i aria-hidden="true" />
            <div><strong>{voiceLabel(voiceState)}</strong><p>{voiceDetail}</p></div>
            {(voiceState === "limited" || voiceState === "stopped" || voiceState === "error") && asrConfigured && (
              <button type="button" onClick={() => void toggleRecognition()}>继续识别</button>
            )}
            {voiceState === "unconfigured" && <a href="/#asr-lab">配置语音</a>}
          </div>
        </aside>
      </main>
    </div>
  );
}
