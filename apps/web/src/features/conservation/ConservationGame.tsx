import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ELEMENTS } from "../periodic-table/elements.generated";
import {
  ConservationCanvas,
  type ConservationCanvasHandle,
} from "./ConservationCanvas";
import { CONSERVATION_REACTIONS } from "./reaction-library";
import {
  CATEGORY_LABELS,
  balanceRows,
  canonicalGuess,
  createPuzzle,
  evaluateBalance,
  fillOneHint,
  formatBalancedEquation,
  selectRandomReactions,
  type CoefficientGuess,
  type GameLevel,
  type ReactionPuzzle,
} from "./logic";
import "./conservation.css";

type GamePhase = "setup" | "playing" | "animating" | "solved" | "finished";
type Slot = { side: "reactants" | "products"; index: number };
type Feedback = {
  kind: "ready" | "incomplete" | "observe" | "simplify" | "hint" | "success";
  text: string;
};
type RoundResult = {
  reactionId: string;
  equation: string;
  title: string;
  usedHint: boolean;
  seconds: number;
};

const ELEMENT_NAME = new Map(ELEMENTS.map((element) => [element.symbol, element.chineseName]));
const LEVEL_OPTIONS: readonly {
  value: GameLevel;
  label: string;
  caption: string;
}[] = [
  { value: "starter", label: "启航", caption: "只补 1—2 个系数" },
  { value: "explorer", label: "探索", caption: "大部分系数等你发现" },
  { value: "challenge", label: "挑战", caption: "全部系数自己配平" },
];

function firstEditable(puzzle: ReactionPuzzle): Slot | null {
  const reactant = puzzle.locked.reactants.findIndex((locked) => !locked);
  if (reactant >= 0) return { side: "reactants", index: reactant };
  const product = puzzle.locked.products.findIndex((locked) => !locked);
  return product >= 0 ? { side: "products", index: product } : null;
}

function slotKey(slot: Slot) {
  return `${slot.side}-${slot.index}`;
}

function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export function ConservationGame() {
  const [questionCount, setQuestionCount] = useState<5 | 10 | 20>(5);
  const [level, setLevel] = useState<GameLevel>("starter");
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [puzzles, setPuzzles] = useState<ReactionPuzzle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [guess, setGuess] = useState<CoefficientGuess>({ reactants: [], products: [] });
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [hintedSlots, setHintedSlots] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback>({
    kind: "ready",
    text: "先观察每一种元素，再点亮化学式前面的数字。",
  });
  const [results, setResults] = useState<RoundResult[]>([]);
  const [batchNumber, setBatchNumber] = useState(1);

  const canvasRef = useRef<ConservationCanvasHandle>(null);
  const questionStartedAtRef = useRef(Date.now());
  const currentPuzzle = puzzles[currentIndex];
  const currentReaction = currentPuzzle?.reaction;

  const rows = useMemo(() => (
    currentReaction
      ? balanceRows(currentReaction, guess)
      : []
  ), [currentReaction, guess]);
  const balancedElementCount = rows.filter((row) => row.balanced).length;

  const loadPuzzle = useCallback((puzzle: ReactionPuzzle) => {
    setGuess(puzzle.initial);
    setSelectedSlot(firstEditable(puzzle));
    setHintedSlots(new Set());
    setFeedback({
      kind: "ready",
      text: "观察左右两边，同一种元素的原子数量要一样多。",
    });
    setPhase("playing");
    questionStartedAtRef.current = Date.now();
    canvasRef.current?.reset();
  }, []);

  const startGame = () => {
    const selected = selectRandomReactions(
      CONSERVATION_REACTIONS,
      questionCount,
      level,
    );
    const nextPuzzles = selected.map((reaction) => createPuzzle(reaction, level));
    setPuzzles(nextPuzzles);
    setCurrentIndex(0);
    setResults([]);
    setBatchNumber((number) => number + 1);
    if (nextPuzzles[0]) loadPuzzle(nextPuzzles[0]);
  };

  const setCoefficient = useCallback((value: number) => {
    if (!selectedSlot || phase !== "playing" || !currentPuzzle) return;
    const locked = currentPuzzle.locked[selectedSlot.side][selectedSlot.index];
    if (locked) return;
    setGuess((current) => {
      const nextSide = [...current[selectedSlot.side]];
      nextSide[selectedSlot.index] = value;
      return { ...current, [selectedSlot.side]: nextSide };
    });
    setFeedback({
      kind: "ready",
      text: `系数 ${value} 已经放好，看看元素天平有没有更接近平衡。`,
    });
  }, [currentPuzzle, phase, selectedSlot]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (/^[1-9]$/.test(event.key)) setCoefficient(Number(event.key));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [setCoefficient]);

  const updateSlot = (
    side: Slot["side"],
    index: number,
    locked: boolean,
  ) => {
    if (locked || phase !== "playing") return;
    setSelectedSlot({ side, index });
  };

  const checkBalance = () => {
    if (!currentReaction || phase !== "playing") return;
    const evaluation = evaluateBalance(currentReaction, guess);
    if (evaluation.status === "incomplete") {
      setFeedback({ kind: "incomplete", text: "还有发光的问号槽，先把每个数字都点亮吧。" });
      return;
    }
    if (evaluation.status === "unbalanced") {
      const elementName = ELEMENT_NAME.get(evaluation.focus.symbol) ?? evaluation.focus.symbol;
      setFeedback({
        kind: "observe",
        text: `先看看${elementName}：左边 ${evaluation.focus.left} 个，右边 ${evaluation.focus.right} 个。`,
      });
      return;
    }
    if (evaluation.status === "proportional") {
      setFeedback({
        kind: "simplify",
        text: `两边已经一样多啦！所有数字还能一起除以 ${evaluation.commonFactor}，再缩成最简的一组。`,
      });
      return;
    }

    setFeedback({ kind: "success", text: "守恒锁定！每一种原子都找到了自己的位置。" });
    setPhase("animating");
    setResults((current) => [
      ...current,
      {
        reactionId: currentReaction.id,
        equation: formatBalancedEquation(currentReaction),
        title: currentReaction.title,
        usedHint: hintedSlots.size > 0,
        seconds: Math.max(1, Math.round((Date.now() - questionStartedAtRef.current) / 1000)),
      },
    ]);
    canvasRef.current?.play();
  };

  const useHint = () => {
    if (!currentPuzzle || phase !== "playing") return;
    const result = fillOneHint(currentPuzzle, guess);
    if (!result.filled) {
      setFeedback({ kind: "hint", text: "提示员检查完啦：这些系数已经与最简答案一致。" });
      return;
    }
    setGuess(result.guess);
    setHintedSlots((current) => new Set([...current, slotKey(result.filled!)]));
    setSelectedSlot(result.filled);
    setFeedback({
      kind: "hint",
      text: `提示员帮你点亮了一个 ${result.guess[result.filled.side][result.filled.index]}，继续观察天平吧。`,
    });
  };

  const nextQuestion = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= puzzles.length) {
      setPhase("finished");
      return;
    }
    setCurrentIndex(nextIndex);
    loadPuzzle(puzzles[nextIndex]!);
  };

  const replaceQuestion = () => {
    if (!currentPuzzle || phase !== "playing") return;
    const usedIds = new Set([
      ...puzzles.map((puzzle) => puzzle.reaction.id),
      ...results.map((result) => result.reactionId),
    ]);
    const replacement = selectRandomReactions(
      CONSERVATION_REACTIONS.filter((reaction) => !usedIds.has(reaction.id)),
      1,
      level,
    )[0];
    if (!replacement) return;
    const nextPuzzle = createPuzzle(replacement, level);
    setPuzzles((current) => current.map((puzzle, index) => (
      index === currentIndex ? nextPuzzle : puzzle
    )));
    loadPuzzle(nextPuzzle);
  };

  if (phase === "setup") {
    return (
      <div className="conservation-page">
        <div className="conservation-stars" aria-hidden="true" />
        <header className="conservation-topbar">
          <a href="/" className="conservation-back">← 学习大厅</a>
          <div className="conservation-brand"><span aria-hidden="true">⚖</span><strong>物质守恒</strong></div>
          <span className="library-count">{CONSERVATION_REACTIONS.length} 条常见反应</span>
        </header>
        <main className="setup-main">
          <section className="setup-hero">
            <div className="setup-copy">
              <p>CONSERVATION LAB · 守恒校准舱</p>
              <h1>原子不会消失，<em>只是换了新队伍。</em></h1>
              <p className="setup-lead">
                调整化学式前面的数字，让箭头两边每一种原子都一样多。
                右下角的小数字属于物质名字，不能改变哦。
              </p>
              <div className="equation-preview" aria-label="配平示例">
                <span className="preview-coefficient">2</span><strong>H₂</strong>
                <i>+</i><strong>O₂</strong><b>→</b>
                <span className="preview-coefficient">2</span><strong>H₂O</strong>
              </div>
            </div>
            <aside className="setup-console">
              <div className="setup-field">
                <span>本局题目</span>
                <div className="segmented-options">
                  {([5, 10, 20] as const).map((count) => (
                    <button
                      type="button"
                      key={count}
                      className={questionCount === count ? "is-selected" : ""}
                      onClick={() => setQuestionCount(count)}
                    >
                      {questionCount === count && <i aria-hidden="true">✓</i>}
                      {count} 道
                    </button>
                  ))}
                </div>
              </div>
              <div className="setup-field">
                <span>探索难度</span>
                <div className="level-options">
                  {LEVEL_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={level === option.value ? "is-selected" : ""}
                      onClick={() => setLevel(option.value)}
                    >
                      <strong>{level === option.value && <i aria-hidden="true">✓</i>}{option.label}</strong>
                      <small>{option.caption}</small>
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="start-conservation" onClick={startGame}>
                <span aria-hidden="true">▶</span> 点火开始
              </button>
              <p className="setup-safety">虚拟守恒演示 · 不提供实验用量或操作步骤</p>
            </aside>
          </section>
        </main>
      </div>
    );
  }

  if (phase === "finished") {
    const independent = results.filter((result) => !result.usedHint).length;
    const totalSeconds = results.reduce((sum, result) => sum + result.seconds, 0);
    return (
      <div className="conservation-page">
        <div className="conservation-stars" aria-hidden="true" />
        <header className="conservation-topbar">
          <a href="/" className="conservation-back">← 学习大厅</a>
          <div className="conservation-brand"><span aria-hidden="true">⚖</span><strong>物质守恒</strong></div>
          <span className="library-count">第 {batchNumber - 1} 次校准完成</span>
        </header>
        <main className="finish-main">
          <section className="finish-celebration">
            <span className="finish-orbit" aria-hidden="true">✓</span>
            <p>守恒校准完成</p>
            <h1>{results.length} / {puzzles.length} 个反应全部平衡</h1>
            <p>木木让每一个原子都找到了位置。配平不是创造原子，而是把原来的原子数清楚地写出来。</p>
            <div className="finish-stats">
              <span><strong>{independent}</strong><small>自己完成</small></span>
              <span><strong>{results.length - independent}</strong><small>借助提示</small></span>
              <span><strong>{formatSeconds(totalSeconds)}</strong><small>总探索时间</small></span>
            </div>
          </section>
          <section className="finish-list">
            {results.map((result, index) => (
              <article key={result.reactionId}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{result.title}</strong><p>{result.equation}</p></div>
                <em>{result.usedHint ? "提示后完成" : "独立完成"} · {formatSeconds(result.seconds)}</em>
              </article>
            ))}
          </section>
          <div className="finish-actions">
            <button type="button" onClick={startGame}>↻ 再来一轮</button>
            <a href="/">返回学习大厅</a>
          </div>
        </main>
      </div>
    );
  }

  if (!currentPuzzle || !currentReaction) return null;

  const renderSide = (side: Slot["side"]) => {
    const species = currentReaction[side];
    return species.map((item, index) => {
      const locked = currentPuzzle.locked[side][index]!;
      const value = guess[side][index];
      const slot: Slot = { side, index };
      const selected = selectedSlot?.side === side && selectedSlot.index === index;
      const hinted = hintedSlots.has(slotKey(slot));
      return (
        <div className="equation-species" key={`${side}-${item.formula}-${index}`}>
          <button
            type="button"
            className={`coefficient-slot ${locked ? "is-locked" : ""} ${selected ? "is-selected" : ""} ${hinted ? "is-hinted" : ""}`}
            onClick={() => updateSlot(side, index, locked)}
            disabled={locked || phase !== "playing"}
            aria-label={`${item.formula}前的系数，${locked ? `已给出${value}` : value ? `当前是${value}` : "等待填写"}`}
          >
            {value ?? "?"}
            <small>{locked ? "给定" : hinted ? "提示" : "系数"}</small>
          </button>
          <strong>{item.formula}</strong>
        </div>
      );
    });
  };

  return (
    <div className="conservation-page">
      <div className="conservation-stars" aria-hidden="true" />
      <header className="conservation-topbar">
        <a href="/" className="conservation-back">← 学习大厅</a>
        <div className="conservation-brand"><span aria-hidden="true">⚖</span><strong>物质守恒</strong></div>
        <button type="button" className="replace-reaction" onClick={replaceQuestion} disabled={phase !== "playing"}>
          ↻ 换一道
        </button>
      </header>

      <main className="conservation-main">
        <section className="mission-strip">
          <div>
            <span>第 {currentIndex + 1} / {puzzles.length} 题</span>
            <div className="mission-progress"><i style={{ width: `${((currentIndex + Number(phase === "solved")) / puzzles.length) * 100}%` }} /></div>
          </div>
          <p>{LEVEL_OPTIONS.find((option) => option.value === level)?.label}模式</p>
          <p>{balancedElementCount} / {rows.length} 种元素暂时平衡</p>
        </section>

        <section className="reaction-intro">
          <div>
            <span>{CATEGORY_LABELS[currentReaction.category]} · {currentReaction.condition}</span>
            <h1>{currentReaction.title}</h1>
            <p>{currentReaction.description}</p>
          </div>
          <aside><strong>会看到什么？</strong><p>{currentReaction.observation}</p></aside>
        </section>

        <section className="balancing-lab">
          <div className="equation-scroll">
            <div className={`chemical-equation ${phase === "solved" ? "is-solved" : ""}`}>
              <div className="equation-side reactant-side">{renderSide("reactants").reduce<React.ReactNode[]>((items, item, index) => (
                [...items, index > 0 ? <span className="equation-plus" key={`left-plus-${index}`}>+</span> : null, item]
              ), [])}</div>
              <div className="reaction-arrow"><span>→</span><small>原子重新排队</small></div>
              <div className="equation-side product-side">{renderSide("products").reduce<React.ReactNode[]>((items, item, index) => (
                [...items, index > 0 ? <span className="equation-plus" key={`right-plus-${index}`}>+</span> : null, item]
              ), [])}</div>
            </div>
          </div>
          <p className="formula-rule"><strong>只改前面的大数字</strong> · 化学式右下角的小数字属于物质名字，不能改变。</p>

          <div className="lab-grid">
            <div className="animation-panel">
              <ConservationCanvas
                ref={canvasRef}
                reaction={currentReaction}
                onComplete={() => setPhase("solved")}
              />
              <div className={`feedback-banner is-${feedback.kind}`} aria-live="polite">
                <span aria-hidden="true">
                  {feedback.kind === "success" ? "✓" : feedback.kind === "observe" ? "◌" : "✦"}
                </span>
                <p>{feedback.text}</p>
              </div>
            </div>

            <aside className="element-balance" aria-label="元素守恒天平">
              <header><div><span>ELEMENT BALANCE</span><h2>元素天平</h2></div><strong>{balancedElementCount}/{rows.length}</strong></header>
              <div className="balance-rows">
                {rows.map((row) => (
                  <article className={row.balanced ? "is-balanced" : ""} key={row.symbol}>
                    <div className="element-identity"><strong>{row.symbol}</strong><small>{ELEMENT_NAME.get(row.symbol) ?? row.symbol}</small></div>
                    <div className="balance-beam">
                      <span>左 {row.left}</span>
                      <i style={{ transform: row.balanced ? "rotate(0deg)" : `rotate(${Math.max(-6, Math.min(6, row.difference * -2))}deg)` }} />
                      <span>右 {row.right}</span>
                    </div>
                    <em>{row.balanced ? "✓ 一样多" : `相差 ${Math.abs(row.difference)}`}</em>
                  </article>
                ))}
              </div>
            </aside>
          </div>

          <section className="number-console">
            <div>
              <span>数字控制台</span>
              <p>{selectedSlot ? "点击数字，放进当前发光的系数槽" : "先选择一个系数槽"}</p>
            </div>
            <div className="number-keys">
              {Array.from({ length: 15 }, (_, index) => index + 1).map((number) => (
                <button
                  type="button"
                  key={number}
                  onClick={() => setCoefficient(number)}
                  disabled={!selectedSlot || phase !== "playing"}
                >
                  {number}
                </button>
              ))}
            </div>
            <div className="console-actions">
              {phase === "solved" ? (
                <button type="button" className="next-reaction" onClick={nextQuestion}>
                  {currentIndex + 1 === puzzles.length ? "查看本局结果" : "下一道反应"} →
                </button>
              ) : (
                <>
                  <button type="button" className="hint-button" onClick={useHint} disabled={phase !== "playing"}>✦ 给我一个提示</button>
                  <button type="button" className="check-button" onClick={checkBalance} disabled={phase !== "playing"}>
                    {phase === "animating" ? "原子重排中…" : "⚖ 检查配平"}
                  </button>
                </>
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
