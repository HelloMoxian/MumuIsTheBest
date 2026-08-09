import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import characterAsset from "../../../../../content/chinese/common-characters.v1.json";
import {
  ASR_SESSION_LIMIT_MINUTES,
  AsrRecognitionSession,
  readAsrConfiguration,
  type RecognitionResult,
  type RecognitionState,
} from "../add-subtract/asr-client";
import {
  PINYIN_GROUPS,
  PINYIN_UNITS,
  charactersForPinyinUnit,
  detectPinyinVoiceCommands,
  groupById,
  movePinyinSelection,
  samplePinyinCharacters,
  splitHighlightedPinyin,
  stepPinyinGroup,
  type PinyinCharacter,
  type PinyinDirection,
  type PinyinGroupId,
  type PinyinUnit,
} from "./logic";
import "./pinyin-bridge.css";

type VoiceState = RecognitionState | "idle" | "unconfigured";
type VoiceSentenceProgress = {
  directionCount: number;
  finalHandled: boolean;
};

const ALL_CHARACTERS = characterAsset.characters as PinyinCharacter[];
const GROUP_LABEL: Record<PinyinGroupId, string> = {
  initial: "声母",
  final: "韵母",
  whole: "整体认读音节",
};

function voiceLabel(state: VoiceState) {
  const labels: Record<VoiceState, string> = {
    idle: "语音导航未开启",
    unconfigured: "需要先配置语音",
    connecting: "正在连接语音",
    listening: "正在听导航指令",
    finishing: "正在结束识别",
    limited: `本次已到 ${ASR_SESSION_LIMIT_MINUTES} 分钟`,
    stopped: "语音导航已停止",
    error: "语音暂时不可用",
  };
  return labels[state];
}

function useResponsiveAtlas() {
  const [layout, setLayout] = useState(() => ({
    compact: false,
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
  }));

  useEffect(() => {
    const measure = () => {
      setLayout({
        compact: window.innerWidth <= 760 || window.innerHeight <= 720,
        width: window.innerWidth,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const columnsFor = useCallback(
    (groupId: PinyinGroupId) => {
      if (!layout.compact) return groupId === "whole" ? 8 : 12;
      if (layout.width < 460) return 5;
      if (layout.width < 680) return 6;
      return 8;
    },
    [layout],
  );

  return { ...layout, columnsFor };
}

function HighlightedPinyin({
  character,
  unit,
}: {
  character: PinyinCharacter;
  unit: PinyinUnit;
}) {
  const highlighted = splitHighlightedPinyin(character.pinyin, unit);
  return (
    <p
      className="pinyin-reading"
      aria-label={`${character.character} 的完整拼音是 ${character.pinyin}，其中 ${highlighted.match || unit.value} 是当前学习部分`}
    >
      <span aria-hidden="true">{highlighted.before}</span>
      <mark aria-hidden="true">{highlighted.match || unit.value}</mark>
      <span aria-hidden="true">{highlighted.after}</span>
    </p>
  );
}

function PinyinDetailDialog({
  unit,
  characters,
  onShuffle,
  onClose,
}: {
  unit: PinyinUnit;
  characters: readonly PinyinCharacter[];
  onShuffle: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const slots = Array.from({ length: 6 }, (_, index) => characters[index] ?? null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="pinyin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`pinyin-dialog group-${unit.group}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pinyin-detail-title"
      >
        <header className="pinyin-dialog-header">
          <div className="dialog-pinyin-orbit" aria-hidden="true">
            <i />
            <strong>{unit.value}</strong>
          </div>
          <div className="dialog-title">
            <span>{GROUP_LABEL[unit.group]} · 汉字星群</span>
            <h2 id="pinyin-detail-title">
              拼音 <em>{unit.value}</em> 能遇见哪些汉字？
            </h2>
            <p>亮起来的部分，就是这次正在观察的拼音。</p>
          </div>
          <button
            ref={closeButtonRef}
            className="dialog-close"
            type="button"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span> 关闭卡片
          </button>
        </header>

        <div className="pinyin-character-grid">
          {slots.map((character, index) => {
            if (!character) {
              return (
                <article className="pinyin-character-card is-empty" key={`empty-${index}`}>
                  <span aria-hidden="true">✦</span>
                  <strong>等待新字</strong>
                  <p>常用字里暂时没有更多啦</p>
                </article>
              );
            }
            const words = character.words
              .filter((word) => word.includes(character.character))
              .slice(0, 2);
            return (
              <article className="pinyin-character-card" key={character.character}>
                <div className="character-card-top">
                  <strong className="pinyin-hanzi">{character.character}</strong>
                  <div>
                    <small>完整拼音</small>
                    <HighlightedPinyin character={character} unit={unit} />
                  </div>
                </div>
                <div className="pinyin-word-list" aria-label={`${character.character} 的组词`}>
                  {words.map((word) => <span key={word}>{word}</span>)}
                </div>
              </article>
            );
          })}
        </div>

        <footer className="pinyin-dialog-footer">
          <p aria-live="polite">
            本次找到 {characters.length} 个常用字
            {characters.length < 6 ? "，少一点也没关系，每个都很特别" : "，还可以换一批继续看"}
          </p>
          <div>
            <button type="button" className="shuffle-button" onClick={onShuffle}>
              <span aria-hidden="true">↻</span> 换一批汉字
            </button>
            <button type="button" className="dialog-done" onClick={onClose}>
              <span aria-hidden="true">✓</span> 看完了
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function PinyinBridgePage() {
  const { compact, columnsFor } = useResponsiveAtlas();
  const [activeGroup, setActiveGroup] = useState<PinyinGroupId>("initial");
  const [selectedId, setSelectedId] = useState("initial:b");
  const [detailUnit, setDetailUnit] = useState<PinyinUnit | null>(null);
  const [detailCharacters, setDetailCharacters] = useState<PinyinCharacter[]>([]);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceDetail, setVoiceDetail] = useState(
    "可以说方向、切换分区、详细信息、换一批或关闭卡片",
  );
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [asrConfigured, setAsrConfigured] = useState<boolean | null>(null);

  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const recognitionRef = useRef<AsrRecognitionSession | null>(null);
  const sentenceProgressRef = useRef(new Map<number, VoiceSentenceProgress>());
  const activeGroupRef = useRef<PinyinGroupId>("initial");
  const selectedIdRef = useRef("initial:b");
  const detailUnitRef = useRef<PinyinUnit | null>(null);
  const columnsForRef = useRef(columnsFor);

  const candidateMap = useMemo(
    () =>
      new Map(
        PINYIN_UNITS.map((unit) => [
          unit.id,
          charactersForPinyinUnit(ALL_CHARACTERS, unit),
        ]),
      ),
    [],
  );

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    detailUnitRef.current = detailUnit;
  }, [detailUnit]);

  useEffect(() => {
    columnsForRef.current = columnsFor;
  }, [columnsFor]);

  useEffect(() => {
    void readAsrConfiguration()
      .then((configuration) => {
        setAsrConfigured(configuration.isConfigured);
        if (!configuration.isConfigured) {
          setVoiceState("unconfigured");
          setVoiceDetail("请先到首页“功能测试”里保存阿里云 API Key");
        }
      })
      .catch(() => {
        setAsrConfigured(false);
        setVoiceState("error");
        setVoiceDetail("暂时无法读取本机语音配置");
      });
    return () => {
      void recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const focusUnit = useCallback((unitId: string) => {
    window.requestAnimationFrame(() => {
      buttonRefs.current.get(unitId)?.focus({ preventScroll: true });
    });
  }, []);

  const selectUnit = useCallback(
    (unit: PinyinUnit, focus = true) => {
      activeGroupRef.current = unit.group;
      selectedIdRef.current = unit.id;
      setActiveGroup(unit.group);
      setSelectedId(unit.id);
      if (focus) focusUnit(unit.id);
    },
    [focusUnit],
  );

  const switchGroup = useCallback(
    (groupId: PinyinGroupId) => {
      const first = groupById(groupId).units[0]!;
      selectUnit(first);
      setVoiceDetail(`已经来到${GROUP_LABEL[groupId]}区`);
    },
    [selectUnit],
  );

  const shuffleDetail = useCallback((unit: PinyinUnit) => {
    const candidates = candidateMap.get(unit.id) ?? [];
    setDetailCharacters(samplePinyinCharacters(candidates, 6));
  }, [candidateMap]);

  const openDetail = useCallback(
    (unit: PinyinUnit) => {
      selectUnit(unit, false);
      shuffleDetail(unit);
      detailUnitRef.current = unit;
      setDetailUnit(unit);
      setVoiceDetail(`已打开拼音 ${unit.value} 的汉字卡片，可以说“换一批”`);
    },
    [selectUnit, shuffleDetail],
  );

  const closeDetail = useCallback(() => {
    const closing = detailUnitRef.current;
    detailUnitRef.current = null;
    setDetailUnit(null);
    setVoiceDetail("已经回到拼音总表，可以继续说方向");
    if (closing) focusUnit(closing.id);
  }, [focusUnit]);

  const moveSelection = useCallback(
    (direction: PinyinDirection) => {
      if (detailUnitRef.current) return;
      const groupId = activeGroupRef.current;
      const next = movePinyinSelection(
        groupId,
        selectedIdRef.current,
        direction,
        columnsForRef.current(groupId),
      );
      selectUnit(next);
    },
    [selectUnit],
  );

  const handleVoiceResult = useCallback(
    (result: RecognitionResult) => {
      setVoiceTranscript(result.text);
      const commands = detectPinyinVoiceCommands(result.text);
      const moves = commands.filter(
        (command): command is Extract<(typeof commands)[number], { kind: "move" }> =>
          command.kind === "move",
      );
      const previous = sentenceProgressRef.current.get(result.sentenceId) ?? {
        directionCount: 0,
        finalHandled: false,
      };
      const newMoves = moves.slice(previous.directionCount);
      for (const command of newMoves) moveSelection(command.direction);

      const nextProgress = {
        directionCount: Math.max(previous.directionCount, moves.length),
        finalHandled: previous.finalHandled,
      };
      if (result.isFinal && !previous.finalHandled) {
        nextProgress.finalHandled = true;
        const finalCommand = commands.find((command) => command.kind !== "move");
        if (finalCommand?.kind === "group") {
          if (detailUnitRef.current) closeDetail();
          switchGroup(finalCommand.group);
        } else if (finalCommand?.kind === "group-step") {
          if (detailUnitRef.current) closeDetail();
          switchGroup(
            stepPinyinGroup(activeGroupRef.current, finalCommand.step).id,
          );
        } else if (finalCommand?.kind === "action") {
          if (finalCommand.action === "home") {
            window.location.assign("/");
          } else if (finalCommand.action === "close") {
            if (detailUnitRef.current) closeDetail();
            else setVoiceDetail("卡片已经关闭，可以继续探索拼音表");
          } else if (finalCommand.action === "shuffle") {
            if (detailUnitRef.current) {
              shuffleDetail(detailUnitRef.current);
              setVoiceDetail("已经换了一批汉字");
            } else {
              setVoiceDetail("先说“详细信息”打开汉字卡片");
            }
          } else if (finalCommand.action === "open") {
            const selected = PINYIN_UNITS.find(
              (unit) => unit.id === selectedIdRef.current,
            );
            if (selected) openDetail(selected);
          }
        } else if (newMoves.length > 0) {
          setVoiceDetail(`识别到 ${newMoves.length} 个方向指令`);
        }
      }
      sentenceProgressRef.current.set(result.sentenceId, nextProgress);
    },
    [
      closeDetail,
      moveSelection,
      openDetail,
      shuffleDetail,
      switchGroup,
    ],
  );

  const stopVoice = useCallback(async () => {
    const session = recognitionRef.current;
    recognitionRef.current = null;
    if (session) await session.stop();
    setVoiceState("stopped");
    setVoiceDetail("语音导航已停止，需要时可以重新开启");
  }, []);

  const startVoice = useCallback(async () => {
    if (!asrConfigured) {
      setVoiceState("unconfigured");
      setVoiceDetail("请先返回首页，在“功能测试”里保存阿里云 API Key");
      return;
    }
    await recognitionRef.current?.stop();
    sentenceProgressRef.current.clear();
    const session = new AsrRecognitionSession({
      onState: (state, detail) => {
        if (recognitionRef.current !== session) return;
        setVoiceState(state);
        if (detail) setVoiceDetail(detail);
        if (state === "limited" || state === "stopped") recognitionRef.current = null;
      },
      onResult: (result) => {
        if (recognitionRef.current === session) handleVoiceResult(result);
      },
      onError: (message) => {
        if (recognitionRef.current !== session) return;
        recognitionRef.current = null;
        setVoiceState("error");
        setVoiceDetail(message);
      },
    });
    recognitionRef.current = session;
    await session.start();
  }, [asrConfigured, handleVoiceResult]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (detailUnitRef.current) return;
      const direction = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      }[event.key] as PinyinDirection | undefined;
      if (direction) {
        event.preventDefault();
        moveSelection(direction);
      }
      if (
        (event.key === "Enter" || event.key === " ") &&
        (event.target as HTMLElement).closest(".pinyin-unit")
      ) {
        event.preventDefault();
        const selected = PINYIN_UNITS.find(
          (unit) => unit.id === selectedIdRef.current,
        );
        if (selected) openDetail(selected);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveSelection, openDetail]);

  const selectedUnit =
    PINYIN_UNITS.find((unit) => unit.id === selectedId) ?? PINYIN_UNITS[0]!;
  const selectedCandidateCount = candidateMap.get(selectedUnit.id)?.length ?? 0;
  const listening = voiceState === "listening";
  const voiceBusy = voiceState === "connecting" || voiceState === "finishing";

  return (
    <div className={`pinyin-page ${compact ? "is-compact" : ""}`}>
      <div className="pinyin-stars" aria-hidden="true" />
      <header className="pinyin-topbar">
        <a href="/" className="pinyin-back">
          <span aria-hidden="true">←</span> 学习大厅
        </a>
        <div className="pinyin-brand">
          <span aria-hidden="true">ā</span>
          <div><strong>拼音星桥</strong><small>声母、韵母和汉字在这里相遇</small></div>
        </div>
        <button
          type="button"
          className={`pinyin-voice state-${voiceState}`}
          onClick={() => void (listening ? stopVoice() : startVoice())}
          disabled={voiceBusy || asrConfigured === null}
          title={voiceDetail}
          aria-label={`${voiceLabel(voiceState)}。${voiceDetail}`}
        >
          <i aria-hidden="true" />
          <span>
            <strong>{voiceLabel(voiceState)}</strong>
            <small>
              {listening
                ? "点击停止"
                : voiceState === "limited"
                  ? "点击继续识别"
                  : "点击开启"}
            </small>
          </span>
        </button>
      </header>

      <main className="pinyin-main">
        <section className="pinyin-command-deck" aria-label="当前拼音和语音提示">
          <div className="selected-pinyin-dock">
            <span>{GROUP_LABEL[selectedUnit.group]}</span>
            <strong>{selectedUnit.value}</strong>
            <p>在常用字资料中找到 {selectedCandidateCount} 个相关汉字</p>
          </div>
          <div className="voice-guide" aria-live="polite">
            <span aria-hidden="true">⌁</span>
            <p>
              <strong>{voiceDetail}</strong>
              <small>
                {voiceTranscript
                  ? `刚刚听到：${voiceTranscript}`
                  : "语音可说：方向、声母区、韵母区、整体认读区、详细信息"}
              </small>
            </p>
          </div>
        </section>

        <nav className="pinyin-group-tabs" aria-label="拼音分区">
          {PINYIN_GROUPS.map((group) => (
            <button
              type="button"
              className={activeGroup === group.id ? "is-active" : ""}
              aria-pressed={activeGroup === group.id}
              onClick={() => switchGroup(group.id)}
              key={group.id}
            >
              <strong>{group.shortLabel}</strong>
              <span>{group.units.length} 个</span>
            </button>
          ))}
        </nav>

        <div className="pinyin-atlas" aria-label="完整拼音总表">
          {PINYIN_GROUPS.map((group) => {
            const columns = columnsFor(group.id);
            return (
              <section
                className={`pinyin-group group-${group.id} ${activeGroup === group.id ? "is-active" : ""}`}
                aria-labelledby={`pinyin-group-${group.id}`}
                style={{ "--pinyin-columns": columns } as CSSProperties}
                key={group.id}
              >
                <header className="pinyin-group-heading">
                  <span aria-hidden="true">
                    {group.id === "initial" ? "01" : group.id === "final" ? "02" : "03"}
                  </span>
                  <div>
                    <h2 id={`pinyin-group-${group.id}`}>{group.label}</h2>
                    <p>{group.description} · {group.units.length} 个</p>
                  </div>
                </header>
                <div className="pinyin-unit-grid">
                  {group.units.map((unit, index) => (
                    <button
                      ref={(node) => {
                        if (node) buttonRefs.current.set(unit.id, node);
                        else buttonRefs.current.delete(unit.id);
                      }}
                      type="button"
                      className={`pinyin-unit ${selectedId === unit.id ? "is-selected" : ""}`}
                      aria-label={`${GROUP_LABEL[unit.group]} ${unit.value}，第 ${index + 1} 个`}
                      aria-pressed={selectedId === unit.id}
                      onFocus={() => selectUnit(unit, false)}
                      onClick={() => openDetail(unit)}
                      key={unit.id}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{unit.value}</strong>
                      <small>{GROUP_LABEL[unit.group]}</small>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      {detailUnit && (
        <PinyinDetailDialog
          unit={detailUnit}
          characters={detailCharacters}
          onShuffle={() => {
            shuffleDetail(detailUnit);
            setVoiceDetail("已经换了一批汉字");
          }}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}
