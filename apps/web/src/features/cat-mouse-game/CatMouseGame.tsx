import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  generateCatMousePuzzle,
  puzzleSignature,
  type ActorId,
  type CatMousePuzzle,
} from "./logic";
import { useLearningRewardSession } from "../../shared/LearningCoinLayer";
import { useNumericKeypadSubmission } from "../../shared/numeric-keypad";
import {
  catMouseResultSpeech,
  speakLearningMoment,
} from "../../shared/experience";
import "./cat-mouse-game.css";

type AnswerState = "answering" | "retry" | "correct" | "revealed";

const HOUSE_BACKGROUNDS = new Set([
  "background-living-room",
  "background-kitchen",
  "background-dining-room",
  "background-hallway-stairs",
]);

function characterPath(actor: ActorId, sprite: string) {
  return `/images/tom-and-jerry-library/sprites/characters/${actor}/${sprite}.png`;
}

function propPath(sprite: string) {
  const category = sprite.startsWith("measure-") ? "measurement" : "gags";
  return `/images/tom-and-jerry-library/sprites/props/${category}/${sprite}.png`;
}

function backgroundPath(background: string) {
  const category = HOUSE_BACKGROUNDS.has(background) ? "house" : "world";
  return `/images/tom-and-jerry-library/sprites/backgrounds/${category}/${background}.png`;
}

function StageSprite({
  src,
  alt,
  className = "",
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  return <img className={`cat-mouse-sprite ${className}`} src={src} alt={alt} style={style} draggable={false} />;
}

function MeasureLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`scene-measure ${className}`}><i aria-hidden="true" />{children}</span>;
}

function ActorSprite({
  puzzle,
  actor = puzzle.visual.actor,
  sprite = puzzle.visual.actorSprite,
  className = "",
  style,
}: {
  puzzle: CatMousePuzzle;
  actor?: ActorId;
  sprite?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const names: Record<ActorId, string> = { tom: "汤姆", jerry: "杰瑞", spike: "斯派克" };
  return (
    <StageSprite
      src={characterPath(actor, sprite)}
      alt={names[actor]}
      className={`actor-sprite actor-${actor} ${className}`}
      style={style}
    />
  );
}

function SumDifferenceScene({ puzzle }: { puzzle: CatMousePuzzle }) {
  const { answer, objectHeight, difference, total } = puzzle.numbers;
  const actorHeight = Math.max(34, Math.round((answer / objectHeight) * 68));
  return (
    <div className="picture-panel-grid sum-difference-scene">
      <article className="picture-panel">
        <div className="height-comparison">
          <ActorSprite puzzle={puzzle} style={{ height: `${actorHeight}%` }} />
          <StageSprite src={propPath(puzzle.visual.referenceSprite)} alt="高度参照物" className="reference-tall" />
          <MeasureLabel className="measure-gap">{difference} 厘米</MeasureLabel>
        </div>
        <p>顶端比杰瑞高 {difference} 厘米</p>
      </article>
      <article className="picture-panel">
        <div className="stacked-height">
          <div className="stacked-subjects">
            <ActorSprite puzzle={puzzle} className="stacked-actor" />
            <StageSprite src={propPath(puzzle.visual.referenceSprite)} alt="高度参照物" className="stacked-reference" />
          </div>
          <MeasureLabel className="measure-total">{total} 厘米</MeasureLabel>
        </div>
        <p>站到顶端后一共 {total} 厘米</p>
      </article>
    </div>
  );
}

function StackAddScene({ puzzle }: { puzzle: CatMousePuzzle }) {
  const { baseHeight, total } = puzzle.numbers;
  return (
    <div className="single-picture-panel">
      <div className="stacked-height is-large">
        <div className="stacked-subjects">
          <ActorSprite puzzle={puzzle} className="stacked-actor" />
          <StageSprite src={propPath(puzzle.visual.referenceSprite)} alt="台子" className="stacked-reference short-reference" />
        </div>
        <MeasureLabel className="measure-total">总高 {total} 厘米</MeasureLabel>
        <span className="known-object-tag">台子 {baseHeight} 厘米</span>
      </div>
    </div>
  );
}

function HeightDifferenceScene({ puzzle }: { puzzle: CatMousePuzzle }) {
  const { answer, knownHeight, difference } = puzzle.numbers;
  const knownPercent = Math.max(34, Math.round((knownHeight / answer) * 82));
  const partnerActor = puzzle.visual.partnerActor ?? "jerry";
  const partnerSprite = puzzle.visual.partnerSprite ?? "jerry-clever-idle";
  return (
    <div className="single-picture-panel character-comparison">
      <div className="character-height-item">
        <ActorSprite puzzle={puzzle} actor={partnerActor} sprite={partnerSprite} style={{ height: `${knownPercent}%` }} />
        <span>{knownHeight} 厘米</span>
      </div>
      <MeasureLabel className="measure-between">相差 {difference} 厘米</MeasureLabel>
      <div className="character-height-item unknown-character">
        <ActorSprite puzzle={puzzle} style={{ height: "92%" }} />
        <span>x 厘米</span>
      </div>
    </div>
  );
}

function RepeatedLengthScene({ puzzle }: { puzzle: CatMousePuzzle }) {
  const factor = puzzle.visual.factor ?? 2;
  const { extra, total } = puzzle.numbers;
  return (
    <div className="single-picture-panel bridge-picture">
      <MeasureLabel className="measure-horizontal">总长 {total} 厘米</MeasureLabel>
      <div className="plank-equation" aria-label={`${factor} 块未知长度木板，再加 ${extra} 厘米短板`}>
        {Array.from({ length: factor }, (_, index) => (
          <span className="plank-piece" key={index}>
            {index > 0 && <b aria-hidden="true">＋</b>}
            <StageSprite src={propPath(puzzle.visual.referenceSprite)} alt="未知长度木板" />
            <i>x</i>
          </span>
        ))}
        <span className="plank-piece short-piece">
          <b aria-hidden="true">＋</b>
          <StageSprite src={propPath(puzzle.visual.accentSprite)} alt={`${extra} 厘米短板`} />
          <i>{extra}</i>
        </span>
      </div>
      <ActorSprite puzzle={puzzle} className="bridge-watcher" />
    </div>
  );
}

function SharingScene({ puzzle }: { puzzle: CatMousePuzzle }) {
  const factor = puzzle.visual.factor ?? 2;
  const { total } = puzzle.numbers;
  return (
    <div className="single-picture-panel sharing-picture">
      <div className="cheese-total">
        <StageSprite src={propPath(puzzle.visual.accentSprite)} alt="奶酪" />
        <strong>{total} 块</strong>
        <span>平均分</span>
      </div>
      <div className="sharing-arrow" aria-hidden="true">↓</div>
      <div className={`bucket-row buckets-${factor}`}>
        {Array.from({ length: factor }, (_, index) => (
          <div className="bucket-item" key={index}>
            <StageSprite src={propPath(puzzle.visual.referenceSprite)} alt={`第 ${index + 1} 个桶`} />
            <strong>x 块</strong>
          </div>
        ))}
      </div>
      <ActorSprite puzzle={puzzle} className="sharing-jerry" />
    </div>
  );
}

function DoubleAndSingleScene({ puzzle }: { puzzle: CatMousePuzzle }) {
  const { total } = puzzle.numbers;
  const partnerSprite = puzzle.visual.partnerSprite ?? "tom-alert-idle";
  return (
    <div className="picture-panel-grid double-character-scene">
      <article className="picture-panel actor-equivalence">
        <ActorSprite puzzle={puzzle} actor="tom" sprite={partnerSprite} />
        <b aria-hidden="true">＝</b>
        <div className="two-mice">
          <ActorSprite puzzle={puzzle} actor="jerry" sprite={puzzle.visual.actorSprite} />
          <ActorSprite puzzle={puzzle} actor="jerry" sprite={puzzle.visual.actorSprite} />
        </div>
        <p>汤姆相当于两个杰瑞高</p>
      </article>
      <article className="picture-panel actor-total">
        <ActorSprite puzzle={puzzle} actor="tom" sprite={partnerSprite} />
        <b aria-hidden="true">＋</b>
        <ActorSprite puzzle={puzzle} actor="jerry" sprite={puzzle.visual.actorSprite} />
        <MeasureLabel>{total} 厘米</MeasureLabel>
        <p>两个人合起来是 {total} 厘米</p>
      </article>
    </div>
  );
}

function PuzzlePicture({ puzzle }: { puzzle: CatMousePuzzle }) {
  const picture = useMemo(() => {
    switch (puzzle.kind) {
      case "sum-difference":
        return <SumDifferenceScene puzzle={puzzle} />;
      case "stack-add":
        return <StackAddScene puzzle={puzzle} />;
      case "height-difference":
        return <HeightDifferenceScene puzzle={puzzle} />;
      case "double-plus":
      case "triple-plus":
        return <RepeatedLengthScene puzzle={puzzle} />;
      case "share-two":
      case "share-three":
        return <SharingScene puzzle={puzzle} />;
      case "double-and-single":
        return <DoubleAndSingleScene puzzle={puzzle} />;
    }
  }, [puzzle]);

  const pictureStyle = {
    "--picture-background": `url("${backgroundPath(puzzle.visual.backgroundId)}")`,
  } as CSSProperties;

  return (
    <section
      className={`cat-mouse-picture layout-${puzzle.visual.layoutVariant}`}
      style={pictureStyle}
      aria-label="题目图片线索"
    >
      <div className="picture-sky-label"><span>观察图里的高度、数量和组合</span><strong>?</strong></div>
      {picture}
    </section>
  );
}

export function CatMouseGame() {
  const learningRewards = useLearningRewardSession("math:cat-mouse-game");
  const [puzzle, setPuzzle] = useState(() => generateCatMousePuzzle());
  const [answerInput, setAnswerInput] = useState("");
  const [answerState, setAnswerState] = useState<AnswerState>("answering");
  const [coinMessage, setCoinMessage] = useState("");
  const puzzleIdRef = useRef(puzzle.id);
  const rewardedPuzzleIdsRef = useRef(new Set<string>());

  const showSolution = answerState === "correct" || answerState === "revealed";

  const nextPuzzle = () => {
    const previousSignature = puzzleSignature(puzzle);
    let next = generateCatMousePuzzle();
    for (let attempt = 0; attempt < 5 && puzzleSignature(next) === previousSignature; attempt += 1) {
      next = generateCatMousePuzzle();
    }
    puzzleIdRef.current = next.id;
    setPuzzle(next);
    setAnswerInput("");
    setAnswerState("answering");
    setCoinMessage("");
  };

  const checkAnswer = useCallback((value: number) => {
    if (!Number.isInteger(value) || value <= 0 || value > 200) {
      setAnswerState("retry");
      return;
    }
    if (value !== puzzle.answer) {
      setAnswerState("retry");
      return;
    }
    if (rewardedPuzzleIdsRef.current.has(puzzle.id)) return;
    rewardedPuzzleIdsRef.current.add(puzzle.id);
    const rewardedPuzzleId = puzzle.id;
    setAnswerState("correct");
    setCoinMessage("正在把知识币送到顶部…");
    void speakLearningMoment(catMouseResultSpeech({
      kind: puzzle.kind,
      answer: puzzle.answer,
      unit: puzzle.unit,
      equation: puzzle.equations.at(-1) ?? `x = ${puzzle.answer}`,
    }));
    void learningRewards.award()
      .then((result) => {
        if (puzzleIdRef.current !== rewardedPuzzleId) return;
        setCoinMessage(`获得 ${result.rewardCoins} 个知识币！现在共有 ${result.progress.coinBalance} 个。`);
      })
      .catch(() => {
        if (puzzleIdRef.current !== rewardedPuzzleId) return;
        setCoinMessage("答案已经算对，但知识币暂时没有加上；下一题还可以继续获得。");
      });
  }, [learningRewards, puzzle.answer, puzzle.id]);

  const submitAnswer = (event: FormEvent) => {
    event.preventDefault();
    checkAnswer(Number(answerInput));
  };

  useNumericKeypadSubmission(({ value }) => {
    if (showSolution) return;
    setAnswerInput(String(value));
    checkAnswer(value);
  }, !showSolution);

  return (
    <div className={`cat-mouse-page state-${answerState}`}>
      <div className="cat-mouse-stars" aria-hidden="true" />
      <header className="cat-mouse-topbar">
        <a href="/" className="cat-mouse-back">← 学习大厅</a>
        <div className="cat-mouse-brand"><span aria-hidden="true">x?</span><strong>猫鼠游戏</strong></div>
        <button type="button" className="topbar-next" onClick={nextPuzzle}>换一道题</button>
      </header>

      <main className="cat-mouse-main">
        <section className="cat-mouse-mission" aria-labelledby="cat-mouse-title">
          <div className="mission-heading">
            <div>
              <span className="mission-chip">数学任务 · {puzzle.complexity}</span>
              <h1 id="cat-mouse-title">{puzzle.title}</h1>
              <p>{puzzle.story}</p>
            </div>
            <div className="mission-number" aria-label="当前题目"><span>本题</span><strong>x</strong></div>
          </div>

          <PuzzlePicture puzzle={puzzle} />

          <div className="given-strip" aria-label="已知线索">
            {puzzle.givens.map((given) => (
              <article key={given.label}>
                <span>{given.label}</span>
                <strong>{given.value}<small>{given.unit}</small></strong>
              </article>
            ))}
          </div>
        </section>

        <aside className="cat-mouse-solver" aria-labelledby="solver-title">
          <div className="solver-heading">
            <span>列式解谜</span>
            <h2 id="solver-title">{puzzle.question}</h2>
            <p>先观察图片和已知线索，再把答案填进来。</p>
          </div>

          <form className="answer-form" onSubmit={submitAnswer}>
            <label>
              <span>{puzzle.unknownName}</span>
              <div className="answer-input-shell">
                <b>x =</b>
                <input
                  type="number"
                  min={1}
                  max={200}
                  step={1}
                  inputMode="numeric"
                  value={answerInput}
                  onChange={(event) => {
                    setAnswerInput(event.target.value);
                    if (answerState === "retry") setAnswerState("answering");
                  }}
                  aria-describedby="answer-help"
                  disabled={showSolution}
                />
                <em>{puzzle.unit}</em>
              </div>
            </label>
            <p id="answer-help">答案是 1—200 之间的整数，不会有小数或分数。</p>
            <button type="submit" className="check-answer" disabled={!answerInput.trim() || showSolution}>
              <span aria-hidden="true">✓</span> 检查答案
            </button>
          </form>

          <div className={`answer-feedback feedback-${answerState}`} aria-live="polite">
            {answerState === "answering" && <p><strong>慢慢观察</strong><span>图片里的每一段都能变成算式。</span></p>}
            {answerState === "retry" && <p><strong>再想一想</strong><span>可以先找总数、差值，或者相同的几份。</span></p>}
            {answerState === "correct" && <p><strong>算对啦！</strong><span>{coinMessage || "获得 20 个知识币，下面把图片变成完整算式。"}</span></p>}
            {answerState === "revealed" && <p><strong>一起看解法</strong><span>看清每一步，下一题再自己试试。</span></p>}
          </div>

          {!showSolution && (
            <button type="button" className="reveal-solution" onClick={() => setAnswerState("revealed")}>
              看看这题怎么列式
            </button>
          )}

          {showSolution && (
            <section className="solution-card" aria-label="本题解法">
              <div className="solution-formulas">
                <span>从图片列出</span>
                {puzzle.equations.map((equation) => <strong key={equation}>{equation}</strong>)}
              </div>
              <ol>
                {puzzle.solutionSteps.map((step) => (
                  <li key={step.formula}>
                    <span>{step.formula}</span>
                    <p>{step.explanation}</p>
                  </li>
                ))}
              </ol>
              <div className="final-answer"><span>具体答案</span><strong>x = {puzzle.answer} {puzzle.unit}</strong><p>{puzzle.answerSentence}</p></div>
              <button type="button" className="next-puzzle" onClick={nextPuzzle}>下一道不同的题 →</button>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
