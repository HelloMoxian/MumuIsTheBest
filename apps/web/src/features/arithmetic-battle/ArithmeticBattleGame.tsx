import { useCallback, useEffect, useRef, useState } from "react";
import { useLearningRewardSession } from "../../shared/LearningCoinLayer";
import {
  ARITHMETIC_BATTLE_COIN_REWARDS,
  MULTIPLICATION_COIN_REWARDS,
} from "../../shared/learning-coins";
import { useNumericKeypadSubmission } from "../../shared/numeric-keypad";
import {
  arithmeticResultSpeech,
  LocalizedLines,
  speakLearningMoment,
  translateUiText,
} from "../../shared/experience";
import {
  ASR_SESSION_LIMIT_MINUTES,
  AsrRecognitionSession,
  readAsrConfiguration,
  type RecognitionState,
} from "../add-subtract/asr-client";
import {
  formatDuration,
  isRestartCommand,
  isStartCommand,
} from "../add-subtract/logic";
import {
  aggregateBattleHistory,
  difficultyLabel,
  generateBattleQuestions,
  latestBattleCandidate,
  matchBattleAnswers,
  type BattleDifficulty,
  type BattleQuestion,
  type BattleQuestionCount,
  type SolvedBattleQuestion,
  type StoredBattleSession,
} from "./logic";
import {
  aggregateMultiplicationHistory,
  generateMultiplicationQuestions,
  multiplicationDifficultyLabel,
  type MultiplicationDifficulty,
  type StoredMultiplicationSession,
} from "../multiplication/logic";
import "./arithmetic-battle.css";

type BattlePhase = "ready" | "playing" | "finished" | "expired";
type GameVariant = "arithmetic-battle" | "multiplication";
type ParallelDifficulty = BattleDifficulty | MultiplicationDifficulty;
type ParallelStoredSession = StoredBattleSession | StoredMultiplicationSession;
type ResultBubble = { answer: number; message: string } | null;
type RecognitionDisplayState =
  | RecognitionState
  | "idle"
  | "unconfigured";
type PendingCandidate = {
  answer: number;
  isFinal: boolean;
  timer: number;
};

const MUMU_AGE = 5;
const ANSWER_CHECK_INTERVAL_MS = 200;
const NON_MATCH_CONFIRM_MS = 2_000;
const BUBBLE_VISIBLE_MS = 3_600;
const MAX_ASR_SEGMENTS = 5;

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
    <fieldset className="battle-control" disabled={disabled}>
      <legend>{label}</legend>
      <div className="battle-segment-options">
        {options.map((option) => (
          <button
            type="button"
            key={String(option.value)}
            aria-pressed={value === option.value}
            className={value === option.value ? "is-selected" : ""}
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

function recognitionLabel(state: RecognitionDisplayState) {
  const labels: Record<RecognitionDisplayState, string> = {
    idle: "等待语音",
    connecting: "连接中",
    listening: "识别中",
    finishing: "结束中",
    limited: `本段已到 ${ASR_SESSION_LIMIT_MINUTES} 分钟`,
    stopped: "语音已停止",
    unconfigured: "需要配置 ASR",
    error: "连接失败",
  };
  return labels[state];
}

function parallelDifficultyLabel(difficulty: ParallelDifficulty) {
  if (difficulty === "facts" || difficulty === "reverse" || difficulty === "advanced") {
    return multiplicationDifficultyLabel(difficulty);
  }
  return difficultyLabel(difficulty);
}

function baseRewardCoinsForDifficulty(difficulty: ParallelDifficulty) {
  if (difficulty === "facts" || difficulty === "reverse" || difficulty === "advanced") {
    return MULTIPLICATION_COIN_REWARDS[difficulty];
  }
  return ARITHMETIC_BATTLE_COIN_REWARDS[difficulty];
}

export function ArithmeticBattleGame({
  variant = "arithmetic-battle",
}: {
  variant?: GameVariant;
} = {}) {
  const isMultiplication = variant === "multiplication";
  const learningRewards = useLearningRewardSession(
    isMultiplication ? "math:multiplication" : "math:arithmetic-battle",
  );
  const gameTitle = isMultiplication ? "乘法小能手" : "算数大战";
  const historyEndpoint = isMultiplication
    ? "/api/math/multiplication/history"
    : "/api/math/arithmetic-battle/history";
  const difficultyOptions: ReadonlyArray<{
    value: ParallelDifficulty;
    label: string;
  }> = isMultiplication
    ? [
        { value: "facts", label: "0—10 乘法" },
        { value: "reverse", label: "逆向除法" },
        { value: "advanced", label: "进阶乘除" },
      ]
    : [
        { value: "easy", label: "简单" },
        { value: "medium", label: "中等" },
        { value: "hard", label: "超难" },
      ];
  const [questionCount, setQuestionCount] = useState<BattleQuestionCount>(5);
  const [difficulty, setDifficulty] = useState<ParallelDifficulty>(
    isMultiplication ? "facts" : "easy",
  );
  const [phase, setPhase] = useState<BattlePhase>("ready");
  const [questions, setQuestions] = useState<BattleQuestion[]>([]);
  const [solvedQuestions, setSolvedQuestions] = useState<SolvedBattleQuestion[]>([]);
  const [asrSegmentCount, setAsrSegmentCount] = useState(0);
  const [recognitionRestartToken, setRecognitionRestartToken] = useState(0);
  const [recognitionState, setRecognitionState] =
    useState<RecognitionDisplayState>("idle");
  const [recognitionDetail, setRecognitionDetail] =
    useState("说“开始”或按下按钮，五颗题目星会同时出现");
  const [transcript, setTranscript] = useState("");
  const [resultBubble, setResultBubble] = useState<ResultBubble>(null);
  const [asrConfigured, setAsrConfigured] = useState<boolean | null>(null);
  const [saveWarning, setSaveWarning] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historySessions, setHistorySessions] = useState<ParallelStoredSession[]>([]);
  const baseRewardCoins = baseRewardCoinsForDifficulty(difficulty);
  const effectiveRewardCoins = baseRewardCoins * (learningRewards.session?.multiplier ?? 1);

  const recognitionRef = useRef<AsrRecognitionSession | null>(null);
  const questionsRef = useRef<BattleQuestion[]>([]);
  const solvedByIdRef = useRef(new Map<string, SolvedBattleQuestion>());
  const roundStartedAtRef = useRef("");
  const roundStartedAtMsRef = useRef(0);
  const lastCorrectAtMsRef = useRef(0);
  const phaseRef = useRef<BattlePhase>("ready");
  const asrSegmentCountRef = useRef(0);
  const latestRecognitionRef = useRef({ text: "", isFinal: false });
  const answerCheckTimerRef = useRef<number | null>(null);
  const pendingCandidateRef = useRef<PendingCandidate | null>(null);
  const bubbleHideTimerRef = useRef<number | null>(null);
  const announcedCandidatesRef = useRef(new Set<string>());

  const locked = phase === "playing";
  const historyGroups = isMultiplication
    ? aggregateMultiplicationHistory(historySessions as StoredMultiplicationSession[])
    : aggregateBattleHistory(historySessions as StoredBattleSession[]);

  const clearPendingCandidate = useCallback(() => {
    const pending = pendingCandidateRef.current;
    if (pending) window.clearTimeout(pending.timer);
    pendingCandidateRef.current = null;
  }, []);

  const clearAnswerChecking = useCallback(() => {
    if (answerCheckTimerRef.current !== null) {
      window.clearInterval(answerCheckTimerRef.current);
      answerCheckTimerRef.current = null;
    }
    clearPendingCandidate();
    latestRecognitionRef.current = { text: "", isFinal: false };
  }, [clearPendingCandidate]);

  const stopRecognition = useCallback(async () => {
    clearAnswerChecking();
    const current = recognitionRef.current;
    recognitionRef.current = null;
    if (current) await current.stop();
  }, [clearAnswerChecking]);

  const showResultBubble = useCallback((answer: number, alreadySolved: boolean) => {
    const key = `${answer}:${alreadySolved ? "solved" : "outside"}`;
    if (announcedCandidatesRef.current.has(key)) return;
    announcedCandidatesRef.current.add(key);
    if (bubbleHideTimerRef.current !== null) window.clearTimeout(bubbleHideTimerRef.current);
    setResultBubble({
      answer,
      message: alreadySolved
        ? "这颗答案星已经点亮啦，试试其他题"
        : "这个结果不是任何一个题的答案，请再算算",
    });
    bubbleHideTimerRef.current = window.setTimeout(
      () => setResultBubble(null),
      BUBBLE_VISIBLE_MS,
    );
  }, []);

  const saveCompletedBattle = useCallback(
    async (completed: SolvedBattleQuestion[]) => {
      const ordered = [...completed].sort((a, b) => a.solvedOrder - b.solvedOrder);
      const calculationDurationMs = ordered.at(-1)?.solvedAtOffsetMs ?? 0;
      setPhase("finished");
      phaseRef.current = "finished";
      setRecognitionState("idle");
      setRecognitionDetail("全部答案星已经点亮，说“再来一局”可以再次挑战");
      await stopRecognition();
      try {
        const response = await fetch(historyEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startedAt: roundStartedAtRef.current,
            questionCount,
            difficulty,
            childAge: MUMU_AGE,
            totalDurationMs: Math.max(
              calculationDurationMs,
              Date.now() - roundStartedAtMsRef.current,
            ),
            calculationDurationMs,
            asrSessionCount: asrSegmentCountRef.current,
            questions: ordered,
          }),
        });
        const result = (await response.json()) as {
          session?: ParallelStoredSession;
          message?: string;
        };
        if (!response.ok || !result.session) {
          throw new Error(result.message ?? "本局历史记录暂时没有保存成功。");
        }
        setHistorySessions((sessions) => [...sessions, result.session as ParallelStoredSession]);
      } catch (error) {
        setSaveWarning(error instanceof Error ? error.message : "本局历史记录暂时没有保存成功。");
      }
    },
    [difficulty, historyEndpoint, questionCount, stopRecognition],
  );

  const solveQuestion = useCallback(
    (question: BattleQuestion) => {
      if (solvedByIdRef.current.has(question.id) || phaseRef.current !== "playing") return;
      const solvedAt = Date.now();
      const solved: SolvedBattleQuestion = {
        ...question,
        solvedDurationMs: Math.max(0, solvedAt - lastCorrectAtMsRef.current),
        solvedAtOffsetMs: Math.max(0, solvedAt - roundStartedAtMsRef.current),
        solvedOrder: solvedByIdRef.current.size + 1,
      };
      lastCorrectAtMsRef.current = solvedAt;
      solvedByIdRef.current.set(question.id, solved);
      const completed = [...solvedByIdRef.current.values()];
      setSolvedQuestions(completed);
      setResultBubble({
        answer: question.answer,
        message: "答对啦，知识币正在飞向顶部",
      });
      if (bubbleHideTimerRef.current !== null) window.clearTimeout(bubbleHideTimerRef.current);
      bubbleHideTimerRef.current = window.setTimeout(
        () => setResultBubble(null),
        BUBBLE_VISIBLE_MS,
      );
      void learningRewards.award(difficulty).catch(() => {
        setSaveWarning("答案已经记录，但知识币暂时没有加上；下次答题时可以继续获得。");
      });
      void stopRecognition()
        .then(() => speakLearningMoment(arithmeticResultSpeech(question.expression, question.answer)))
        .then(() => {
          if (phaseRef.current === "playing") {
            setRecognitionRestartToken((token) => token + 1);
          }
        });
      if (completed.length === questionsRef.current.length) {
        void saveCompletedBattle(completed);
      }
    },
    [difficulty, learningRewards, saveCompletedBattle, stopRecognition],
  );

  useNumericKeypadSubmission(({ value }) => {
    if (phaseRef.current !== "playing") return;
    const matchingQuestion = questionsRef.current.find(
      (question) => question.answer === value && !solvedByIdRef.current.has(question.id),
    );
    if (matchingQuestion) {
      solveQuestion(matchingQuestion);
      return;
    }
    const alreadySolved = [...solvedByIdRef.current.values()]
      .some((question) => question.answer === value);
    showResultBubble(value, alreadySolved);
  }, phase === "playing");

  const beginAnswerChecking = useCallback(() => {
    clearAnswerChecking();
    answerCheckTimerRef.current = window.setInterval(() => {
      if (phaseRef.current !== "playing") return;
      const unresolved = questionsRef.current.filter(
        (question) => !solvedByIdRef.current.has(question.id),
      );
      const latest = latestRecognitionRef.current;
      const matches = matchBattleAnswers(latest.text, unresolved);
      if (matches.length > 0) {
        clearPendingCandidate();
        for (const question of matches) solveQuestion(question);
        return;
      }

      const candidate = latestBattleCandidate(latest.text);
      if (candidate === null) return;
      const alreadySolved = [...solvedByIdRef.current.values()]
        .some((question) => question.answer === candidate);
      const pending = pendingCandidateRef.current;
      if (pending?.answer === candidate) {
        if (latest.isFinal) pending.isFinal = true;
        return;
      }
      clearPendingCandidate();

      const nextPending: PendingCandidate = {
        answer: candidate,
        isFinal: latest.isFinal,
        timer: window.setTimeout(() => {
          if (pendingCandidateRef.current !== nextPending || phaseRef.current !== "playing") return;
          const currentUnresolved = questionsRef.current.filter(
            (question) => !solvedByIdRef.current.has(question.id),
          );
          const currentMatches = matchBattleAnswers(
            latestRecognitionRef.current.text,
            currentUnresolved,
          );
          if (currentMatches.length > 0) {
            clearPendingCandidate();
            for (const question of currentMatches) solveQuestion(question);
            return;
          }
          const currentCandidate = latestBattleCandidate(latestRecognitionRef.current.text);
          if (nextPending.isFinal || currentCandidate === nextPending.answer) {
            pendingCandidateRef.current = null;
            showResultBubble(nextPending.answer, alreadySolved);
          } else {
            clearPendingCandidate();
          }
        }, NON_MATCH_CONFIRM_MS),
      };
      pendingCandidateRef.current = nextPending;
    }, ANSWER_CHECK_INTERVAL_MS);
  }, [
    clearAnswerChecking,
    clearPendingCandidate,
    showResultBubble,
    solveQuestion,
  ]);

  const openRecognition = useCallback(
    async (
      onText: (text: string, isFinal: boolean) => void,
      onLimit?: () => void,
    ) => {
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
          setRecognitionDetail(detail ?? recognitionLabel(state));
          if (state === "listening" && phaseRef.current === "playing") {
            beginAnswerChecking();
          }
          if (state === "limited") onLimit?.();
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
          clearAnswerChecking();
        },
      });
      recognitionRef.current = session;
      await session.start();
    },
    [asrConfigured, beginAnswerChecking, clearAnswerChecking, stopRecognition],
  );

  const beginRound = useCallback(async () => {
    await stopRecognition();
    if (bubbleHideTimerRef.current !== null) window.clearTimeout(bubbleHideTimerRef.current);
    const generated = isMultiplication
      ? generateMultiplicationQuestions(
          questionCount,
          difficulty as MultiplicationDifficulty,
        )
      : generateBattleQuestions(questionCount, difficulty as BattleDifficulty);
    const now = Date.now();
    questionsRef.current = generated;
    solvedByIdRef.current = new Map();
    roundStartedAtMsRef.current = now;
    lastCorrectAtMsRef.current = now;
    roundStartedAtRef.current = new Date(now).toISOString();
    phaseRef.current = "playing";
    asrSegmentCountRef.current = 1;
    announcedCandidatesRef.current = new Set();
    setQuestions(generated);
    setSolvedQuestions([]);
    setAsrSegmentCount(1);
    setRecognitionRestartToken(0);
    setResultBubble(null);
    setSaveWarning("");
    setPhase("playing");
  }, [difficulty, isMultiplication, questionCount, stopRecognition]);

  const continueRecognition = () => {
    if (asrSegmentCountRef.current >= MAX_ASR_SEGMENTS) return;
    const next = asrSegmentCountRef.current + 1;
    asrSegmentCountRef.current = next;
    setAsrSegmentCount(next);
    setRecognitionState("connecting");
  };

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
    if (phase !== "playing" || asrSegmentCount < 1) return;
    void openRecognition(
      (text, isFinal) => {
        latestRecognitionRef.current = { text, isFinal };
      },
      () => {
        clearAnswerChecking();
        if (asrSegmentCountRef.current >= MAX_ASR_SEGMENTS) {
          phaseRef.current = "expired";
          setPhase("expired");
          setRecognitionDetail("五段语音时间已经用完，这次挑战先休息一下");
        }
      },
    );
    return () => {
      void stopRecognition();
    };
  }, [
    asrSegmentCount,
    clearAnswerChecking,
    openRecognition,
    phase,
    recognitionRestartToken,
    stopRecognition,
  ]);

  useEffect(() => {
    if (
      (phase !== "ready" && phase !== "finished") ||
      asrConfigured !== true
    ) return;
    void openRecognition((text) => {
      if (
        (phase === "ready" && isStartCommand(text)) ||
        (phase === "finished" && isRestartCommand(text))
      ) {
        void beginRound();
      }
    });
    return () => {
      void stopRecognition();
    };
  }, [asrConfigured, beginRound, openRecognition, phase, stopRecognition]);

  useEffect(
    () => () => {
      clearAnswerChecking();
      if (bubbleHideTimerRef.current !== null) window.clearTimeout(bubbleHideTimerRef.current);
      void stopRecognition();
    },
    [clearAnswerChecking, stopRecognition],
  );

  const loadHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(historyEndpoint);
      const result = (await response.json()) as {
        sessions?: ParallelStoredSession[];
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

  return (
    <div className="battle-page">
      <div className="battle-stars" aria-hidden="true" />
      <header className="battle-topbar">
        <a className="battle-brand" href="/"><span aria-hidden="true">←</span>木木学习岛</a>
        <span className="battle-mission">数学任务 · {gameTitle}</span>
        <button className="battle-history-button" type="button" onClick={() => void loadHistory()}>
          <span aria-hidden="true">◷</span> 历史记录
        </button>
      </header>

      <main className="battle-main">
        <section className="battle-cockpit" aria-label="本局配置">
          <Segment
            label="同时出现"
            value={questionCount}
            options={([1, 2, 3, 4, 5] as const).map((value) => ({
              value,
              label: `${value} 题`,
            }))}
            disabled={locked}
            onChange={setQuestionCount}
          />
          <Segment
            label="挑战难度"
            value={difficulty}
            options={difficultyOptions}
            disabled={locked}
            onChange={setDifficulty}
          />
        </section>

        <section className={`battle-stage phase-${phase}`} aria-labelledby="battle-title">
          <div className="battle-background" aria-hidden="true" />
          <div className="battle-status-row" aria-live="polite">
            <span className={`battle-voice-state status-${recognitionState}`}>
              <i aria-hidden="true" /> {recognitionLabel(recognitionState)}
            </span>
            {phase === "playing" && (
              <span className="battle-segment-chip">
                语音能量 {asrSegmentCount} / {MAX_ASR_SEGMENTS} · 每段最多 {ASR_SESSION_LIMIT_MINUTES} 分钟
              </span>
            )}
            {transcript && <span className="battle-transcript">{transcript}</span>}
          </div>

          {phase === "ready" && (
            <div className="battle-ready">
              <span className="battle-eyebrow">答案唯一 · 自由选择解题顺序</span>
              <h1 id="battle-title" data-no-ui-translation>
                <LocalizedLines
                  zh={<>{gameTitle}<br /><em>点亮所有答案星</em></>}
                  en={<>{translateUiText(gameTitle)}<br /><em>Light up every answer star</em></>}
                />
              </h1>
              <p>
                {isMultiplication
                  ? "乘法和整除题会同时出现。说“等于 + 答案”，每个结果只会命中一颗题目星。"
                  : "所有题目会同时出现。说“等于 + 答案”，每个结果只会命中一颗题目星。"}
              </p>
              <button className="battle-start-button" type="button" onClick={() => void beginRound()}>
                <span aria-hidden="true">⚡</span> 开始挑战
              </button>
            </div>
          )}

          {phase === "playing" && (
            <div className={`battle-question-grid count-${questionCount}`}>
              {questions.map((question) => {
                const solved = solvedQuestions.find((item) => item.id === question.id);
                return (
                  <article className={`battle-question-card ${solved ? "is-solved" : ""}`} key={question.id}>
                    <span className="battle-card-number">题目 {questions.indexOf(question) + 1}</span>
                    <div className="battle-expression">
                      {question.expression} <b>=</b> <strong>{solved ? question.answer : "?"}</strong>
                    </div>
                    {solved ? (
                      <span className="battle-solved-meta">
                        <i aria-hidden="true">✓</i>
                        第 {solved.solvedOrder} 颗答案星 · {formatDuration(solved.solvedDurationMs)}
                      </span>
                    ) : (
                      <span className="battle-card-hint">等你来点亮</span>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {resultBubble && phase === "playing" && (
            <aside className="battle-result-bubble" role="status">
              <strong>= {resultBubble.answer}</strong>
              <span>{resultBubble.message}</span>
            </aside>
          )}

          {phase === "playing" && recognitionState === "limited" && asrSegmentCount < 5 && (
            <aside className="battle-recovery">
              <div>
                <strong>这一段语音时间到了</strong>
                <span>题目和进度都保留着，还可以继续 {MAX_ASR_SEGMENTS - asrSegmentCount} 段。</span>
              </div>
              <button type="button" onClick={continueRecognition}>继续识别</button>
            </aside>
          )}

          {phase === "playing" && recognitionState === "error" && (
            <aside className="battle-recovery">
              <div><strong>语音连接需要再试一次</strong><span>{recognitionDetail}</span></div>
              <button type="button" onClick={() => setRecognitionRestartToken((value) => value + 1)}>
                重新连接本段
              </button>
            </aside>
          )}

          {phase === "playing" && recognitionState === "unconfigured" && (
            <aside className="battle-recovery">
              <div><strong>还没有配置语音识别</strong><span>先保存阿里云 API Key，再回来挑战。</span></div>
              <a href="/#asr-lab">打开语音配置</a>
            </aside>
          )}

          {phase === "finished" && (
            <div className="battle-finish">
              <span className="battle-eyebrow">全部点亮 · 100 分</span>
              <h1>
                木木完成了<br />
                {isMultiplication
                  ? `${parallelDifficultyLabel(difficulty)}挑战！`
                  : `${parallelDifficultyLabel(difficulty)}${gameTitle}！`}
              </h1>
              <p>
                每一颗答案星都靠认真计算点亮，正确率 100%，每题获得 {effectiveRewardCoins} 个知识币
                {learningRewards.session?.multiplier === 3 ? `（基础 ${baseRewardCoins} × 3）` : ""}。
              </p>
              <div className="battle-result-list">
                {[...solvedQuestions]
                  .sort((a, b) => a.solvedOrder - b.solvedOrder)
                  .map((question) => (
                    <div key={question.id}>
                      <span>{question.solvedOrder}</span>
                      <strong>{question.expression} = {question.answer}</strong>
                      <em>本题 {formatDuration(question.solvedDurationMs)}</em>
                    </div>
                  ))}
              </div>
              <div className="battle-summary">
                <span>平均每题</span>
                <strong>{formatDuration(
                  (solvedQuestions.at(-1)?.solvedAtOffsetMs ?? 0) / questionCount,
                )}</strong>
                <span>正确率</span><strong>100%</strong>
              </div>
              {saveWarning && <p className="battle-save-warning" role="alert">{saveWarning}</p>}
              <button className="battle-start-button" type="button" onClick={() => void beginRound()}>
                <span aria-hidden="true">↻</span> 再来一局
              </button>
            </div>
          )}

          {phase === "expired" && (
            <div className="battle-expired">
              <span className="battle-eyebrow">今天已经专心挑战了 10 分钟</span>
              <h1>这次先让大脑休息一下</h1>
              <p>已经点亮 {solvedQuestions.length} / {questionCount} 颗答案星。本局没有生成成绩，下次可以继续挑战。</p>
              <button className="battle-start-button" type="button" onClick={() => void beginRound()}>
                <span aria-hidden="true">↻</span> 重新挑战
              </button>
            </div>
          )}
        </section>
      </main>

      {historyOpen && (
        <div className="battle-history-backdrop" role="presentation" onMouseDown={() => setHistoryOpen(false)}>
          <section
            className="battle-history-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="battle-history-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div><span className="battle-eyebrow">家长查看区</span><h2 id="battle-history-title">{gameTitle}历史</h2></div>
              <button type="button" aria-label="关闭历史记录" onClick={() => setHistoryOpen(false)}>×</button>
            </header>
            {historyLoading && <div className="battle-history-state">正在整理挑战星图…</div>}
            {historyError && <div className="battle-history-state is-error">{historyError}</div>}
            {!historyLoading && !historyError && historyGroups.length === 0 && (
              <div className="battle-history-state">
                <strong>还没有完整完成的挑战</strong>
                <span>全部题目解出后，100 分成绩会自动保存在本机。</span>
              </div>
            )}
            <div className="battle-history-groups">
              {historyGroups.map((group) => (
                <article key={group.key}>
                  <div><strong>{group.questionCount} 题 · {parallelDifficultyLabel(group.difficulty)}</strong><span>{group.sessions} 局</span></div>
                  <dl>
                    <div><dt>平均总耗时</dt><dd>{formatDuration(group.averageTotalDurationMs)}</dd></div>
                    <div><dt>单题平均耗时</dt><dd>{formatDuration(group.averageQuestionDurationMs)}</dd></div>
                    <div><dt>平均计算时间</dt><dd>{formatDuration(group.averageCalculationDurationMs)}</dd></div>
                    <div><dt>木木年龄</dt><dd>{group.childAge} 岁</dd></div>
                    <div><dt>正确率</dt><dd>100%</dd></div>
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
