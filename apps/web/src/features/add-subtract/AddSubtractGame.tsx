import { useCallback, useEffect, useRef, useState } from "react";
import { browserTts } from "../../shared/speech";
import { AsrRecognitionSession, readAsrConfiguration, type RecognitionState } from "./asr-client";
import {
  aggregateHistory,
  decideTranscriptAnswer,
  formatDuration,
  generateQuestions,
  isRestartCommand,
  isStartCommand,
  operationLabel,
  recordConfirmedWrong,
  speechQuestion,
  type AttemptEvidence,
  type CompletedQuestion,
  type OperationType,
  type PracticeQuestion,
  type QuestionCount,
  type SpeechType,
  type StoredPracticeSession,
} from "./logic";
import "./add-subtract.css";

type Phase = "ready" | "playing" | "feedback" | "finished";
type Feedback = { kind: "correct" | "retry"; answer: number } | null;
type AttemptState = AttemptEvidence & {
  startedAt: number;
  isResolved: boolean;
};
type PendingWrongAnswer = {
  answer: number;
  isFinal: boolean;
  timer: number;
};

const MUMU_AGE = 5;
const ANSWER_CHECK_INTERVAL_MS = 200;
const WRONG_CONFIRM_DELAY_MS = 2_000;

function Segment<T extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="practice-control" disabled={disabled}>
      <legend>{label}</legend>
      <div className="segment-options">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={value === option.value ? "is-selected" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {value === option.value && <span aria-hidden="true">✓</span>}
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function playSuccessChime() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const now = context.currentTime;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.02 + index * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42 + index * 0.08);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + index * 0.08);
    oscillator.stop(now + 0.5 + index * 0.08);
  });
  window.setTimeout(() => void context.close(), 900);
}

function recognitionCopy(state: RecognitionState | "reading" | "idle" | "unconfigured") {
  const copy = {
    idle: "等待语音",
    connecting: "连接中",
    listening: "识别中",
    reading: "朗读题目",
    finishing: "结束中",
    limited: "已到 2 分钟上限",
    stopped: "语音已停止",
    unconfigured: "需要配置 ASR",
    error: "连接失败",
  };
  return copy[state];
}

export function AddSubtractGame() {
  const [questionCount, setQuestionCount] = useState<QuestionCount>(5);
  const [operationType, setOperationType] = useState<OperationType>("mixed");
  const [speechType, setSpeechType] = useState<SpeechType>("none");
  const [phase, setPhase] = useState<Phase>("ready");
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedQuestions, setCompletedQuestions] = useState<CompletedQuestion[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [transcript, setTranscript] = useState("");
  const [recognitionState, setRecognitionState] =
    useState<RecognitionState | "reading" | "idle" | "unconfigured">("idle");
  const [recognitionDetail, setRecognitionDetail] = useState("说“开始”或按下开始按钮");
  const [asrConfigured, setAsrConfigured] = useState<boolean | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historySessions, setHistorySessions] = useState<StoredPracticeSession[]>([]);
  const [saveWarning, setSaveWarning] = useState("");

  const recognitionRef = useRef<AsrRecognitionSession | null>(null);
  const attemptRef = useRef<AttemptState | null>(null);
  const completedRef = useRef<CompletedQuestion[]>([]);
  const startedAtRef = useRef("");
  const startedAtMsRef = useRef(0);
  const feedbackTimerRef = useRef<number | null>(null);
  const answerCheckTimerRef = useRef<number | null>(null);
  const pendingWrongAnswerRef = useRef<PendingWrongAnswer | null>(null);
  const latestRecognitionRef = useRef({ text: "", isFinal: false });
  const confirmedWrongAnswersRef = useRef(new Set<number>());

  const currentQuestion = questions[currentIndex];
  const locked = phase === "playing" || phase === "feedback";

  const clearPendingWrongAnswer = useCallback(() => {
    const pending = pendingWrongAnswerRef.current;
    if (pending) window.clearTimeout(pending.timer);
    pendingWrongAnswerRef.current = null;
  }, []);

  const clearAnswerChecking = useCallback(() => {
    if (answerCheckTimerRef.current !== null) {
      window.clearInterval(answerCheckTimerRef.current);
      answerCheckTimerRef.current = null;
    }
    clearPendingWrongAnswer();
    latestRecognitionRef.current = { text: "", isFinal: false };
  }, [clearPendingWrongAnswer]);

  const stopRecognition = useCallback(async () => {
    clearAnswerChecking();
    const current = recognitionRef.current;
    recognitionRef.current = null;
    if (current) await current.stop();
  }, [clearAnswerChecking]);

  const saveCompletedRound = useCallback(
    async (finished: CompletedQuestion[]) => {
      const now = Date.now();
      const calculationDurationMs = finished.reduce(
        (sum, question) => sum + question.calculationDurationMs,
        0,
      );
      setPhase("finished");
      setFeedback(null);
      setRecognitionState("idle");
      setRecognitionDetail("说“再来一局”或按下按钮继续");
      try {
        const response = await fetch("/api/math/add-subtract/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startedAt: startedAtRef.current,
            questionCount,
            operationType,
            speechType,
            childAge: MUMU_AGE,
            totalDurationMs: Math.max(calculationDurationMs, now - startedAtMsRef.current),
            calculationDurationMs,
            questions: finished,
          }),
        });
        const result = (await response.json()) as {
          session?: StoredPracticeSession;
          message?: string;
        };
        if (!response.ok || !result.session) {
          throw new Error(result.message ?? "本局历史记录暂时没有保存成功。");
        }
        setHistorySessions((sessions) => [...sessions, result.session as StoredPracticeSession]);
      } catch (error) {
        setSaveWarning(error instanceof Error ? error.message : "本局历史记录暂时没有保存成功。");
      }
    },
    [operationType, questionCount, speechType],
  );

  const recordWrongAttempt = useCallback((answer: number) => {
    const attempt = attemptRef.current;
    if (!attempt || attempt.isResolved) return;
    recordConfirmedWrong(attempt, answer);
  }, []);

  const acceptAnswer = useCallback(
    async (question: PracticeQuestion, answer: number) => {
      const attempt = attemptRef.current;
      if (!attempt || attempt.isResolved) return;

      if (answer !== question.answer) {
        recordWrongAttempt(answer);
        setFeedback({ kind: "retry", answer });
        window.setTimeout(() => {
          setFeedback((current) => (current?.kind === "retry" ? null : current));
        }, 1_600);
        return;
      }

      attempt.isResolved = true;
      clearPendingWrongAnswer();
      const finishedQuestion: CompletedQuestion = {
        ...question,
        firstAttemptCorrect: !attempt.hadConfirmedWrong,
        calculationDurationMs: Math.max(0, Date.now() - attempt.startedAt),
        wrongAnswers: [...attempt.wrongAnswers],
      };
      const finished = [...completedRef.current, finishedQuestion];
      completedRef.current = finished;
      setCompletedQuestions(finished);
      setFeedback({ kind: "correct", answer });
      setPhase("feedback");
      playSuccessChime();
      await stopRecognition();

      feedbackTimerRef.current = window.setTimeout(() => {
        if (finished.length === questions.length) {
          void saveCompletedRound(finished);
        } else {
          setCurrentIndex(finished.length);
          setFeedback(null);
          setPhase("playing");
        }
      }, 2_000);
    },
    [
      clearPendingWrongAnswer,
      questions.length,
      recordWrongAttempt,
      saveCompletedRound,
      stopRecognition,
    ],
  );

  const startRecognition = useCallback(
    async (onText: (text: string, isFinal: boolean) => void) => {
      await stopRecognition();
      if (!asrConfigured) {
        setRecognitionState("unconfigured");
        setRecognitionDetail("请先到功能测试页保存阿里云 API Key");
        return;
      }
      setTranscript("");
      const session = new AsrRecognitionSession({
        onState: (state, detail) => {
          if (recognitionRef.current !== session) return;
          setRecognitionState(state);
          setRecognitionDetail(detail ?? recognitionCopy(state));
          if (state === "limited") setTranscript("当前未识别语音");
        },
        onResult: ({ text, isFinal }) => {
          if (recognitionRef.current !== session) return;
          setTranscript(text);
          onText(text, isFinal);
        },
        onError: (message) => {
          if (recognitionRef.current !== session) return;
          setRecognitionState("error");
          setRecognitionDetail(message);
        },
      });
      recognitionRef.current = session;
      await session.start();
    },
    [asrConfigured, stopRecognition],
  );

  const listenForCurrentQuestion = useCallback(
    async (question: PracticeQuestion, resetAttempt: boolean) => {
      setFeedback(null);
      if (resetAttempt && speechType !== "none") {
        setRecognitionState("reading");
        setRecognitionDetail(speechType === "zh" ? "正在用中文朗读题目" : "Reading the question");
        const result = await browserTts.speak({
          text: speechQuestion(question, speechType),
          lang: speechType === "zh" ? "zh-CN" : "en-US",
          rate: speechType === "zh" ? 0.9 : 0.82,
          pitch: 1.08,
        });
        if (result.status === "cancelled") return;
      }
      if (resetAttempt) {
        attemptRef.current = {
          startedAt: Date.now(),
          wrongAnswers: new Set<number>(),
          hadConfirmedWrong: false,
          isResolved: false,
        };
        confirmedWrongAnswersRef.current = new Set<number>();
      }
      if (attemptRef.current?.isResolved) return;

      await startRecognition((text, isFinal) => {
        latestRecognitionRef.current = { text, isFinal };
        if (isFinal) {
          const finalDecision = decideTranscriptAnswer(text, question.answer);
          if (finalDecision.kind === "wrong") recordWrongAttempt(finalDecision.answer);
        }
      });

      answerCheckTimerRef.current = window.setInterval(() => {
        if (attemptRef.current?.isResolved) {
          clearAnswerChecking();
          return;
        }

        const latest = latestRecognitionRef.current;
        const decision = decideTranscriptAnswer(latest.text, question.answer);
        if (decision.kind === "correct") {
          clearPendingWrongAnswer();
          void acceptAnswer(question, question.answer);
          return;
        }

        if (
          decision.kind !== "wrong" ||
          confirmedWrongAnswersRef.current.has(decision.answer)
        ) return;
        const wrongAnswer = decision.answer;

        const pending = pendingWrongAnswerRef.current;
        if (pending?.answer === wrongAnswer) {
          if (latest.isFinal) pending.isFinal = true;
          return;
        }
        clearPendingWrongAnswer();

        const pendingWrong: PendingWrongAnswer = {
          answer: wrongAnswer,
          isFinal: latest.isFinal,
          timer: window.setTimeout(() => {
            if (attemptRef.current?.isResolved) return;
            const currentPending = pendingWrongAnswerRef.current;
            if (currentPending !== pendingWrong) return;

            const currentDecision = decideTranscriptAnswer(
              latestRecognitionRef.current.text,
              question.answer,
            );
            if (currentDecision.kind === "correct") {
              clearPendingWrongAnswer();
              void acceptAnswer(question, question.answer);
              return;
            }

            if (
              pendingWrong.isFinal ||
              (currentDecision.kind === "wrong" && currentDecision.answer === pendingWrong.answer)
            ) {
              confirmedWrongAnswersRef.current.add(pendingWrong.answer);
              pendingWrongAnswerRef.current = null;
              void acceptAnswer(question, pendingWrong.answer);
            } else {
              clearPendingWrongAnswer();
            }
          }, WRONG_CONFIRM_DELAY_MS),
        };
        pendingWrongAnswerRef.current = pendingWrong;
      }, ANSWER_CHECK_INTERVAL_MS);
    },
    [
      acceptAnswer,
      clearAnswerChecking,
      clearPendingWrongAnswer,
      recordWrongAttempt,
      speechType,
      startRecognition,
    ],
  );

  const beginRound = useCallback(async () => {
    await stopRecognition();
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    const nextQuestions = generateQuestions(questionCount, operationType);
    const now = new Date();
    startedAtRef.current = now.toISOString();
    startedAtMsRef.current = now.getTime();
    completedRef.current = [];
    setQuestions(nextQuestions);
    setCompletedQuestions([]);
    setCurrentIndex(0);
    setFeedback(null);
    setTranscript("");
    setSaveWarning("");
    confirmedWrongAnswersRef.current = new Set<number>();
    setPhase("playing");
  }, [operationType, questionCount, stopRecognition]);

  useEffect(() => {
    void readAsrConfiguration()
      .then((configuration) => {
        setAsrConfigured(configuration.isConfigured);
        if (!configuration.isConfigured) {
          setRecognitionState("unconfigured");
          setRecognitionDetail("请先到功能测试页保存阿里云 API Key");
        }
      })
      .catch(() => {
        setAsrConfigured(false);
        setRecognitionState("error");
        setRecognitionDetail("无法读取本机 ASR 配置，请确认服务已经启动");
      });
  }, []);

  useEffect(() => {
    if (phase !== "playing" || !currentQuestion) return;
    void listenForCurrentQuestion(currentQuestion, true);
    return () => {
      void stopRecognition();
      browserTts.stop();
    };
  }, [currentIndex, currentQuestion, listenForCurrentQuestion, phase, stopRecognition]);

  useEffect(() => {
    if ((phase !== "ready" && phase !== "finished") || asrConfigured !== true) return;
    void startRecognition((text) => {
      if ((phase === "ready" && isStartCommand(text)) || (phase === "finished" && isRestartCommand(text))) {
        void beginRound();
      }
    });
    return () => {
      void stopRecognition();
    };
  }, [asrConfigured, beginRound, phase, startRecognition, stopRecognition]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
      clearAnswerChecking();
      browserTts.stop();
      void stopRecognition();
    },
    [clearAnswerChecking, stopRecognition],
  );

  const loadHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/math/add-subtract/history");
      const result = (await response.json()) as {
        sessions?: StoredPracticeSession[];
        message?: string;
      };
      if (!response.ok || !result.sessions) throw new Error(result.message ?? "历史记录暂时无法读取。");
      setHistorySessions(result.sessions);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "历史记录暂时无法读取。");
    } finally {
      setHistoryLoading(false);
    }
  };

  const historyGroups = aggregateHistory(historySessions);
  const correctCount = completedQuestions.filter((question) => question.firstAttemptCorrect).length;

  return (
    <div className="practice-page">
      <div className="practice-stars" aria-hidden="true" />
      <header className="practice-topbar">
        <a className="practice-brand" href="/">
          <span aria-hidden="true">←</span>
          木木学习岛
        </a>
        <span className="practice-mission">数学任务 · 加减练习</span>
        <button className="history-button" type="button" onClick={() => void loadHistory()}>
          <span aria-hidden="true">◷</span> 历史记录
        </button>
      </header>

      <main className="practice-main">
        <section className="practice-cockpit" aria-label="本局配置">
          <Segment
            label="题目数量"
            value={questionCount}
            options={[
              { value: 5, label: "5 题" },
              { value: 10, label: "10 题" },
              { value: 20, label: "20 题" },
            ]}
            disabled={locked}
            onChange={setQuestionCount}
          />
          <Segment
            label="题目类型"
            value={operationType}
            options={[
              { value: "addition", label: "加" },
              { value: "subtraction", label: "减" },
              { value: "mixed", label: "加减" },
            ]}
            disabled={locked}
            onChange={setOperationType}
          />
          <Segment
            label="语音类型"
            value={speechType}
            options={[
              { value: "none", label: "不朗读" },
              { value: "zh", label: "中文" },
              { value: "en", label: "English" },
            ]}
            disabled={locked}
            onChange={setSpeechType}
          />
        </section>

        <section className={`calculation-stage phase-${phase}`} aria-labelledby="practice-title">
          <div className="number-orbit-art" aria-hidden="true" />
          <div className="stage-progress">
            {locked && (
              <>
                <span>第 {Math.min(currentIndex + 1, questionCount)} / {questionCount} 题</span>
                <div className="progress-track" aria-label={`已完成 ${completedQuestions.length} 题`}>
                  <i style={{ width: `${(completedQuestions.length / questionCount) * 100}%` }} />
                </div>
              </>
            )}
          </div>

          <div className="voice-corner" aria-live="polite">
            <span className={`voice-status status-${recognitionState}`}>
              <i aria-hidden="true" />
              {recognitionCopy(recognitionState)}
            </span>
            {transcript && <span className="voice-transcript">{transcript}</span>}
          </div>

          {phase === "ready" && (
            <div className="ready-content">
              <span className="eyebrow">0—20 数字原子训练</span>
              <h1 id="practice-title">让小小算式<br />变成木木的超能力</h1>
              <p>说“开始 / start”，或者按下按钮。回答时请说“等于 + 答案”。</p>
              <button className="start-button" type="button" onClick={() => void beginRound()}>
                <span aria-hidden="true">▶</span>
                Start <i /> 开始
              </button>
            </div>
          )}

          {(phase === "playing" || phase === "feedback") && currentQuestion && (
            <div className="question-content">
              <div className="question-expression" aria-label={`${currentQuestion.left} ${currentQuestion.operator} ${currentQuestion.right} 等于多少`}>
                <span>{currentQuestion.left}</span>
                <b>{currentQuestion.operator}</b>
                <span>{currentQuestion.right}</span>
                <b>=</b>
                <span className="answer-space">
                  {feedback ? feedback.answer : "?"}
                  {feedback?.kind === "correct" && <i className="correct-mark" aria-label="回答正确">✓</i>}
                  {feedback?.kind === "retry" && <i className="retry-mark" aria-hidden="true">?</i>}
                </span>
              </div>
              <div className="answer-guide" aria-live="assertive">
                {feedback?.kind === "correct" && <strong>答对啦！下一颗数字星正在飞来</strong>}
                {feedback?.kind === "retry" && <strong>再想一想，继续说“等于……”</strong>}
                {!feedback && <span>先想一想，再说“等于 + 答案”</span>}
              </div>
            </div>
          )}

          {phase === "finished" && (
            <div className="result-content">
              <span className="eyebrow">任务完成 · 努力会发光</span>
              <h1>{correctCount} / {questionCount} 第一次就答对</h1>
              <p>想过一次再答对也很棒，每一次尝试都让计算更快。</p>
              <div className="question-results" aria-label="逐题结果">
                {completedQuestions.map((question, index) => (
                  <div className={question.firstAttemptCorrect ? "is-correct" : "is-retried"} key={question.id}>
                    <span>{index + 1}</span>
                    <strong>{question.left} {question.operator} {question.right} = {question.answer}</strong>
                    <em>{question.firstAttemptCorrect ? "✓ 第一次答对" : "↻ 想过后答对"}</em>
                  </div>
                ))}
              </div>
              {saveWarning && <p className="save-warning" role="alert">{saveWarning}</p>}
              <button className="start-button restart-button" type="button" onClick={() => void beginRound()}>
                <span aria-hidden="true">↻</span> 再来一局
              </button>
            </div>
          )}

          {recognitionState === "limited" && (
            <div className="recognition-recovery" role="status">
              <strong>当前未识别语音</strong>
              <span>本次 2 分钟语音已自动停止，题目还在这里。</span>
              <button
                type="button"
                onClick={() => currentQuestion && void listenForCurrentQuestion(currentQuestion, false)}
              >
                继续识别语音
              </button>
            </div>
          )}

          {(recognitionState === "error" || recognitionState === "unconfigured") && (
            <div className="voice-help" role="alert">
              <strong>{recognitionDetail}</strong>
              <a href="/#asr-lab">打开语音识别配置</a>
            </div>
          )}
        </section>
      </main>

      {historyOpen && (
        <div className="history-backdrop" role="presentation" onMouseDown={() => setHistoryOpen(false)}>
          <section
            className="history-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">家长查看区</span>
                <h2 id="history-title">加减练习历史</h2>
              </div>
              <button type="button" aria-label="关闭历史记录" onClick={() => setHistoryOpen(false)}>×</button>
            </header>
            {historyLoading && <div className="history-state">正在整理木木的练习星图…</div>}
            {historyError && <div className="history-state is-error">{historyError}</div>}
            {!historyLoading && !historyError && historyGroups.length === 0 && (
              <div className="history-state">
                <strong>还没有完成的练习记录</strong>
                <span>完整做完一局后，成绩会自动保存在本机。</span>
              </div>
            )}
            <div className="history-groups">
              {historyGroups.map((group) => (
                <article key={group.key}>
                  <div className="history-group-title">
                    <strong>{group.questionCount} 题 · {operationLabel(group.operationType)}</strong>
                    <span>{group.sessions} 局</span>
                  </div>
                  <dl>
                    <div><dt>平均总耗时</dt><dd>{formatDuration(group.totalDurationMs)}</dd></div>
                    <div><dt>单题平均耗时</dt><dd>{formatDuration(group.averageQuestionDurationMs)}</dd></div>
                    <div><dt>平均计算时间</dt><dd>{formatDuration(group.calculationDurationMs)}</dd></div>
                    <div><dt>木木年龄</dt><dd>{group.childAge} 岁</dd></div>
                    <div><dt>正确率</dt><dd>{Math.round(group.accuracy * 100)}%</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
