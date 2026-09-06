import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { browserTts, useTts } from "../../shared/speech";
import {
  learningConclusionSpeech,
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
import type { MissionGameDefinition } from "./logic";
import {
  detectMissionGameCommand,
  isMissionAnswer,
  parseVoiceChoice,
  selectMissions,
  summarizeMissionResults,
  type LearningMission,
  type MissionResult,
} from "./logic";
import "./mission-lab.css";

type GamePhase = "setup" | "playing" | "summary";
type VoiceDisplayState = RecognitionState | "idle" | "unconfigured";

function voiceLabel(state: VoiceDisplayState) {
  const labels: Record<VoiceDisplayState, string> = {
    idle: "语音待命",
    unconfigured: "语音未配置",
    connecting: "正在连接",
    listening: "正在听",
    finishing: "正在收尾",
    limited: `本段已到 ${ASR_SESSION_LIMIT_MINUTES} 分钟`,
    stopped: "语音已暂停",
    error: "语音需要检查",
  };
  return labels[state];
}

function MissionVisualStage({ mission }: { mission: LearningMission }) {
  return (
    <section
      className={`mission-visual visual-${mission.visual.mode}`}
      aria-label={`${mission.visual.eyebrow}：${mission.visual.title}；${mission.visual.tokens.join("、")}`}
    >
      <span className="visual-scan" aria-hidden="true" />
      <p>{mission.visual.eyebrow}</p>
      <h2>{mission.visual.title}</h2>
      <div className="visual-token-field" aria-hidden="true">
        {mission.visual.tokens.map((token, index) => (
          <span
            className={`visual-token token-${index + 1}`}
            key={`${token}-${index}`}
          >
            {token}
          </span>
        ))}
      </div>
      <span className="visual-note">教学观察示意</span>
    </section>
  );
}

export function MissionLabGame({
  definition,
}: {
  definition: MissionGameDefinition;
}) {
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [missionCount, setMissionCount] = useState<5 | 10>(5);
  const [autoRead, setAutoRead] = useState(false);
  const [round, setRound] = useState<LearningMission[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<MissionResult[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [sequenceSelection, setSequenceSelection] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("认真观察，再点亮你的发现。");
  const [transcript, setTranscript] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceDisplayState>("idle");
  const [voiceDetail, setVoiceDetail] = useState("可以说“开始”");
  const [asrConfigured, setAsrConfigured] = useState<boolean | null>(null);
  const [recognitionToken, setRecognitionToken] = useState(0);

  const recognitionRef = useRef<AsrRecognitionSession | null>(null);
  const voiceProcessorRef = useRef<(text: string, isFinal: boolean) => void>(() => undefined);
  const phaseRef = useRef<GamePhase>("setup");
  const roundRef = useRef<LearningMission[]>([]);
  const currentIndexRef = useRef(0);
  const resultsRef = useRef<MissionResult[]>([]);
  const attemptedRef = useRef(false);
  const resolvedRef = useRef(false);
  const sequenceRef = useRef<string[]>([]);
  const readRequestRef = useRef(0);
  const ttsState = useTts({ stopOnUnmount: true });

  const currentMission = round[currentIndex];
  const summary = useMemo(
    () => summarizeMissionResults(results, round.length || missionCount),
    [missionCount, results, round.length],
  );

  const stopRecognition = useCallback(async () => {
    const session = recognitionRef.current;
    recognitionRef.current = null;
    if (session) await session.stop();
  }, []);

  const resetMissionState = useCallback((index: number) => {
    currentIndexRef.current = index;
    attemptedRef.current = false;
    resolvedRef.current = false;
    sequenceRef.current = [];
    setCurrentIndex(index);
    setAttempted(false);
    setResolved(false);
    setSequenceSelection([]);
    setTranscript("");
    setFeedback("认真观察，再点亮你的发现。");
  }, []);

  const startRound = useCallback(() => {
    const missions = selectMissions(definition, missionCount);
    roundRef.current = missions;
    resultsRef.current = [];
    phaseRef.current = "playing";
    setRound(missions);
    setResults([]);
    setPhase("playing");
    resetMissionState(0);
    setVoiceDetail("可以说候选项，也可以说“第一个”“第二个”");
  }, [definition, missionCount, resetMissionState]);

  const finishRound = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    phaseRef.current = "summary";
    setPhase("summary");
    setVoiceDetail("本局星图已经整理好，说“再来一局”可以继续");
    browserTts.stop();
  }, []);

  const resolveMission = useCallback((mission: LearningMission) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setResolved(true);
    setFeedback(mission.conclusion);
    const result: MissionResult = {
      missionId: mission.id,
      conclusion: mission.conclusion,
      discoveredFirstTry: !attemptedRef.current,
    };
    const nextResults = [...resultsRef.current, result];
    resultsRef.current = nextResults;
    setResults(nextResults);
    void stopRecognition()
      .then(() => speakLearningMoment(learningConclusionSpeech(
        `${mission.conclusion} ${mission.explanation}`,
        `${translateUiText(mission.conclusion)} ${translateUiText(mission.explanation)}`,
      )))
      .then(() => {
        if (asrConfigured && phaseRef.current === "playing") {
          setRecognitionToken((token) => token + 1);
        }
      });
  }, [asrConfigured, stopRecognition]);

  const submitSequence = useCallback((
    mission: LearningMission,
    selection: readonly string[],
  ) => {
    if (selection.length < mission.choices.length) {
      setFeedback(`还差 ${mission.choices.length - selection.length} 个步骤，继续点亮吧。`);
      return;
    }
    if (isMissionAnswer(mission, selection)) {
      resolveMission(mission);
      return;
    }
    attemptedRef.current = true;
    sequenceRef.current = [];
    setAttempted(true);
    setSequenceSelection([]);
    setFeedback(mission.hint);
  }, [resolveMission]);

  const handleChoice = useCallback((choiceId: string) => {
    const mission = roundRef.current[currentIndexRef.current];
    if (!mission || phaseRef.current !== "playing" || resolvedRef.current) return;
    if (mission.kind === "choice") {
      if (isMissionAnswer(mission, choiceId)) {
        resolveMission(mission);
      } else {
        attemptedRef.current = true;
        setAttempted(true);
        setFeedback(mission.hint);
      }
      return;
    }
    if (sequenceRef.current.includes(choiceId)) {
      const next = sequenceRef.current.filter((id) => id !== choiceId);
      sequenceRef.current = next;
      setSequenceSelection(next);
      setFeedback("这一项已经回到候选区，可以重新安排顺序。");
      return;
    }
    const next = [...sequenceRef.current, choiceId];
    sequenceRef.current = next;
    setSequenceSelection(next);
    setFeedback(
      next.length === mission.choices.length
        ? "顺序已经排好，点“检查轨道”看看。"
        : `已经点亮第 ${next.length} 站。`,
    );
  }, [resolveMission]);

  const advance = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    if (!resolvedRef.current) {
      setFeedback("先完成这一个发现，再进入下一站。");
      return;
    }
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= roundRef.current.length) {
      finishRound();
      return;
    }
    resetMissionState(nextIndex);
  }, [finishRound, resetMissionState]);

  const readCurrentMission = useCallback(async () => {
    const requestId = readRequestRef.current + 1;
    readRequestRef.current = requestId;
    const mission = roundRef.current[currentIndexRef.current];
    if (!mission || phaseRef.current !== "playing") return;
    await stopRecognition();
    setVoiceState("stopped");
    setVoiceDetail("正在朗读，读完后再继续听");
    const optionText = mission.choices
      .map((option, index) => `第${["一", "二", "三", "四", "五"][index]}个，${option.label}`)
      .join("。");
    const result = await browserTts.speak({
      text: `${mission.prompt}。${optionText}。`,
      lang: definition.speechLanguage,
      rate: 0.88,
      pitch: 1.03,
      preferLocalVoice: true,
    });
    if (readRequestRef.current !== requestId) return;
    if (result.status === "completed" && asrConfigured) {
      setVoiceDetail("朗读完成，正在重新打开语音");
      setRecognitionToken((token) => token + 1);
    } else if (result.status !== "cancelled") {
      setVoiceDetail(
        result.status === "unavailable" || result.status === "error"
          ? "这台设备暂时不能朗读，文字仍可正常学习"
          : "朗读已经结束",
      );
    }
  }, [asrConfigured, definition.speechLanguage, stopRecognition]);

  const processVoiceText = useCallback((text: string, isFinal: boolean) => {
    setTranscript(text);
    if (!isFinal) return;
    const command = detectMissionGameCommand(text);
    if (command === "continue-voice") {
      setRecognitionToken((token) => token + 1);
      return;
    }
    if (command === "start" && phaseRef.current !== "playing") {
      startRound();
      return;
    }
    if (command === "end") {
      if (phaseRef.current === "playing") finishRound();
      else window.location.href = "/";
      return;
    }
    if (command === "repeat") {
      void readCurrentMission();
      return;
    }
    if (command === "check" && phaseRef.current === "playing") {
      const mission = roundRef.current[currentIndexRef.current];
      if (mission?.kind === "sequence") {
        submitSequence(mission, sequenceRef.current);
      }
      return;
    }
    if (command === "next") {
      if (phaseRef.current === "playing") advance();
      else startRound();
      return;
    }
    if (phaseRef.current !== "playing" || resolvedRef.current) return;
    const mission = roundRef.current[currentIndexRef.current];
    if (!mission) return;
    const choiceId = parseVoiceChoice(text, mission.choices);
    if (choiceId) {
      handleChoice(choiceId);
    } else {
      setVoiceDetail("听到了声音，请说候选项或“第一个、第二个”。");
    }
  }, [advance, finishRound, handleChoice, readCurrentMission, startRound, submitSequence]);

  voiceProcessorRef.current = processVoiceText;

  useEffect(() => {
    void readAsrConfiguration()
      .then(({ isConfigured }) => {
        setAsrConfigured(isConfigured);
        setVoiceState(isConfigured ? "idle" : "unconfigured");
        setVoiceDetail(
          isConfigured
            ? "语音已经准备好"
            : "还没有配置语音，也可以使用按钮完成全部任务",
        );
        if (isConfigured) setRecognitionToken((token) => token + 1);
      })
      .catch(() => {
        setAsrConfigured(false);
        setVoiceState("error");
        setVoiceDetail("暂时无法读取语音配置，按钮仍然可以使用");
      });
  }, []);

  useEffect(() => {
    if (!asrConfigured || recognitionToken === 0) return undefined;
    const session = new AsrRecognitionSession({
      onState: (state, detail) => {
        if (recognitionRef.current !== session) return;
        setVoiceState(state);
        setVoiceDetail(detail ?? voiceLabel(state));
      },
      onResult: ({ text, isFinal }) => {
        if (recognitionRef.current !== session) return;
        voiceProcessorRef.current(text, isFinal);
      },
      onError: (message) => {
        if (recognitionRef.current !== session) return;
        setVoiceState("error");
        setVoiceDetail(message);
      },
    });
    recognitionRef.current = session;
    void session.start();
    return () => {
      if (recognitionRef.current === session) recognitionRef.current = null;
      void session.stop();
    };
  }, [asrConfigured, recognitionToken]);

  useEffect(() => () => {
    readRequestRef.current += 1;
    void stopRecognition();
  }, [stopRecognition]);

  useEffect(() => {
    if (!autoRead || phase !== "playing" || !currentMission || resolved) return undefined;
    const timer = window.setTimeout(() => void readCurrentMission(), 180);
    return () => window.clearTimeout(timer);
  }, [autoRead, currentMission, phase, readCurrentMission, resolved]);

  const setSequence = (choiceId: string) => handleChoice(choiceId);

  if (phase === "setup") {
    return (
      <div className={`mission-lab-page accent-${definition.accent}`}>
        <div className="mission-lab-stars" aria-hidden="true" />
        <header className="mission-lab-topbar">
          <a href="/" className="mission-back">← 学习大厅</a>
          <div className="mission-brand"><span aria-hidden="true">{definition.mark}</span><strong>{definition.title}</strong></div>
          <span className={`mission-voice-chip state-${voiceState}`}><i />{voiceLabel(voiceState)}</span>
        </header>
        <main className="mission-setup-main">
          <section className="mission-intro-card">
            <div className="intro-orbit" aria-hidden="true"><i /><i /><i /><b>{definition.mark}</b></div>
            <p>{definition.subject} · DISCOVERY MISSION</p>
            <h1>{definition.title}</h1>
            <h2>{definition.subtitle}</h2>
            <p className="mission-introduction">{definition.introduction}</p>
            <div className="mission-goals" aria-label="本玩法学习目标">
              {definition.goals.map((goal, index) => (
                <span key={goal}><b>{index + 1}</b>{goal}</span>
              ))}
            </div>
          </section>
          <aside className="mission-launch-panel">
            <p className="panel-kicker">本次航线</p>
            <h2>选好任务数量，就出发</h2>
            <fieldset>
              <legend>任务数量</legend>
              <div className="mission-segments">
                {([5, 10] as const).map((count) => (
                  <button
                    className={missionCount === count ? "is-selected" : ""}
                    type="button"
                    key={count}
                    aria-pressed={missionCount === count}
                    onClick={() => setMissionCount(count)}
                  >
                    {missionCount === count && <span aria-hidden="true">✓</span>}
                    {count} 个发现
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="mission-toggle">
              <input
                type="checkbox"
                checked={autoRead}
                onChange={(event) => setAutoRead(event.target.checked)}
              />
              <span aria-hidden="true"><i /></span>
              <b>每题自动朗读</b>
              <small>朗读时会先暂停麦克风</small>
            </label>
            <button className="mission-primary-button" type="button" onClick={startRound}>
              <span aria-hidden="true">▶</span> 开始探索
            </button>
            <p className="mission-voice-detail" aria-live="polite">{voiceDetail}</p>
          </aside>
        </main>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className={`mission-lab-page accent-${definition.accent}`}>
        <div className="mission-lab-stars" aria-hidden="true" />
        <header className="mission-lab-topbar">
          <a href="/" className="mission-back">← 学习大厅</a>
          <div className="mission-brand"><span aria-hidden="true">{definition.mark}</span><strong>{definition.title}</strong></div>
          <span className={`mission-voice-chip state-${voiceState}`}><i />{voiceLabel(voiceState)}</span>
        </header>
        <main className="mission-summary-main">
          <section className="mission-summary-hero">
            <p>{summary.completeRound ? "本局星图完成" : "已经保存这次观察"}</p>
            <h1 data-no-ui-translation>
              <LocalizedLines
                zh={<>{summary.completed} 个新发现，<em>都装进木木的知识舱。</em></>}
                en={<><em>{summary.completed} new discoveries</em> saved in Mumu&apos;s knowledge deck.</>}
              />
            </h1>
            <div className="summary-stats">
              <article><strong>{summary.firstTry}</strong><span>第一次发现</span></article>
              <article><strong>{summary.observed}</strong><span>观察后发现</span></article>
              <article><strong>{summary.completed}/{summary.expected}</strong><span>完成航点</span></article>
            </div>
          </section>
          <section className="mission-discovery-log" aria-label="本局知识星图">
            {results.map((result, index) => (
              <article key={`${result.missionId}-${index}`}>
                <span>{index + 1}</span>
                <p>{result.conclusion}</p>
                <strong>{result.discoveredFirstTry ? "一次发现" : "观察后发现"}</strong>
              </article>
            ))}
            {results.length === 0 && (
              <div className="mission-empty-state">
                <strong>这次还没有完成知识航点</strong>
                <p>没关系，下一局可以从第一个观察开始。</p>
              </div>
            )}
          </section>
          <div className="mission-summary-actions">
            <button className="mission-primary-button" type="button" onClick={startRound}>↻ 再来一局</button>
            <a className="mission-secondary-button" href="/">返回学习大厅</a>
          </div>
        </main>
      </div>
    );
  }

  if (!currentMission) return null;
  const progress = ((currentIndex + (resolved ? 1 : 0)) / round.length) * 100;

  return (
    <div className={`mission-lab-page is-playing accent-${definition.accent}`}>
      <div className="mission-lab-stars" aria-hidden="true" />
      <header className="mission-lab-topbar playing-topbar">
        <a href="/" className="mission-back">← 大厅</a>
        <div className="mission-progress" aria-label={`第 ${currentIndex + 1} 个，共 ${round.length} 个`}>
          <span>发现 {currentIndex + 1} / {round.length}</span>
          <i><b style={{ width: `${progress}%` }} /></i>
        </div>
        <div className="mission-audio-status">
          <span className={`mission-voice-chip state-${voiceState}`}><i />{voiceLabel(voiceState)}</span>
          <button type="button" onClick={() => void readCurrentMission()} disabled={ttsState.status === "speaking"}>
            {ttsState.status === "speaking" ? "正在朗读" : "朗读题目"}
          </button>
        </div>
      </header>
      <main className="mission-playing-main">
        <MissionVisualStage mission={currentMission} />
        <section className="mission-question-panel" aria-labelledby="mission-prompt">
          <p className="question-kicker">{currentMission.kind === "sequence" ? "按顺序点亮" : "选择你的发现"}</p>
          <h1 id="mission-prompt">{currentMission.prompt}</h1>
          {currentMission.kind === "sequence" && (
            <div className="sequence-rail" aria-label="当前排列顺序">
              {currentMission.choices.map((_, index) => {
                const selectedId = sequenceSelection[index];
                const selected = currentMission.choices.find((option) => option.id === selectedId);
                return (
                  <span className={selected ? "is-filled" : ""} key={index}>
                    <b>{index + 1}</b>
                    {selected?.label ?? "等待点亮"}
                  </span>
                );
              })}
            </div>
          )}
          <div className={`mission-options ${currentMission.kind === "sequence" ? "is-sequence" : ""}`}>
            {currentMission.choices.map((option, index) => {
              const selected = sequenceSelection.includes(option.id);
              return (
                <button
                  className={selected ? "is-selected" : ""}
                  type="button"
                  key={option.id}
                  disabled={resolved}
                  aria-pressed={selected}
                  onClick={() => setSequence(option.id)}
                >
                  <span className="option-number">{selected ? "✓" : index + 1}</span>
                  <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
                </button>
              );
            })}
          </div>
          {currentMission.kind === "sequence" && !resolved && (
            <button
              className="sequence-check-button"
              type="button"
              onClick={() => submitSequence(currentMission, sequenceSelection)}
            >
              检查轨道顺序
            </button>
          )}
          <div className={`mission-feedback ${resolved ? "is-resolved" : attempted ? "needs-observation" : ""}`} aria-live="polite">
            <span aria-hidden="true">{resolved ? "✓" : attempted ? "⌕" : "✦"}</span>
            <div>
              <strong>{feedback}</strong>
              {resolved && <p>{currentMission.explanation}</p>}
            </div>
          </div>
          <div className="mission-bottom-actions">
            <button className="mission-quiet-button" type="button" onClick={finishRound}>结束本局</button>
            <button className="mission-primary-button" type="button" disabled={!resolved} onClick={advance}>
              {currentIndex + 1 === round.length ? "查看本局星图" : "下一个发现 →"}
            </button>
          </div>
          <p className="mission-transcript" aria-live="polite">
            <span className={`voice-pulse state-${voiceState}`} aria-hidden="true" />
            {transcript || voiceDetail}
          </p>
          {(voiceState === "limited" || voiceState === "error" || voiceState === "stopped") && asrConfigured && (
            <button className="continue-voice-button" type="button" onClick={() => setRecognitionToken((token) => token + 1)}>
              继续识别语音
            </button>
          )}
          {voiceState === "unconfigured" && (
            <a className="continue-voice-button" href="/tools/asr-lab">请家长配置语音</a>
          )}
        </section>
      </main>
    </div>
  );
}
