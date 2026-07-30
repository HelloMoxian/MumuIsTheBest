import { useEffect, useMemo, useRef, useState } from "react";
import { CURVE_COLORS, FunctionGraphCanvas } from "./FunctionGraphCanvas";
import {
  FUNCTION_DEFINITIONS,
  MAX_GRAPH_SPAN,
  MIN_GRAPH_SPAN,
  PARAMETER_ABSOLUTE_LIMIT,
  canAddCurve,
  createFunctionCurve,
  curveEquation,
  describeCurve,
  evaluateCurve,
  formatNumber,
  getDefinition,
  nextGraphSpan,
  normalizeGraphSpan,
  setCurveParameter,
  type FunctionCurve,
  type FunctionKind,
} from "./logic";
import "./mystery-function.css";

type GamePhase = "intro" | "lab" | "summary";
type Notice = { kind: "info" | "limit" | "success"; text: string };

function freeColorIndex(curves: readonly FunctionCurve[]) {
  const used = new Set(curves.map((curve) => curve.colorIndex));
  return [0, 1, 2, 3].find((index) => !used.has(index)) ?? curves.length % 4;
}

function curveLabel(curve: FunctionCurve) {
  return getDefinition(curve.definitionId).name;
}

type NumericCommitInputProps = {
  value: number;
  step: number;
  minimum?: number;
  maximum?: number;
  label: string;
  className?: string;
  onCommit: (value: number) => number;
};

function NumericCommitInput({
  value,
  step,
  minimum,
  maximum,
  label,
  className,
  onCommit,
}: NumericCommitInputProps) {
  const [draft, setDraft] = useState(formatNumber(value));

  useEffect(() => {
    setDraft(formatNumber(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(formatNumber(value));
      return;
    }
    setDraft(formatNumber(onCommit(parsed)));
  };

  return (
    <input
      type="number"
      className={className}
      inputMode="decimal"
      step={step}
      min={minimum}
      max={maximum}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(formatNumber(value));
          event.currentTarget.blur();
        }
      }}
      aria-label={label}
    />
  );
}

export function MysteryFunctionGame() {
  const nextIdRef = useRef(1);
  const [phase, setPhase] = useState<GamePhase>("intro");
  const [curves, setCurves] = useState<FunctionCurve[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [span, setSpan] = useState(10);
  const [probeX, setProbeX] = useState<number | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const [seenKinds, setSeenKinds] = useState<ReadonlySet<FunctionKind>>(new Set());
  const [notice, setNotice] = useState<Notice>({
    kind: "info",
    text: "点一条曲线，再调整右边的参数，看看它怎样变形。",
  });

  const selectedCurve = curves.find((curve) => curve.id === selectedId) ?? null;
  const selectedDefinition = selectedCurve
    ? getDefinition(selectedCurve.definitionId)
    : null;

  const probeValues = useMemo(() => (
    probeX === null
      ? []
      : curves.filter((curve) => curve.visible).map((curve) => ({
        curve,
        value: evaluateCurve(curve, probeX),
      }))
  ), [curves, probeX]);

  const addCurve = (definitionId: FunctionKind, isFirst = false) => {
    if (!isFirst && !canAddCurve(curves)) {
      setNotice({ kind: "limit", text: "四条航线已经全亮啦，先收起一条再添加新公式。" });
      return;
    }
    const id = `function-curve-${nextIdRef.current}`;
    nextIdRef.current += 1;
    const nextCurve = createFunctionCurve(
      definitionId,
      id,
      isFirst ? 0 : freeColorIndex(curves),
    );
    setCurves((current) => isFirst ? [nextCurve] : [...current, nextCurve]);
    setSelectedId(id);
    setSeenKinds((current) => new Set([...current, definitionId]));
    setAnimationKey((key) => key + 1);
    setNotice({
      kind: "success",
      text: `${getDefinition(definitionId).name}已经点亮，试着拨动它的参数吧。`,
    });
  };

  const startLab = () => {
    setPhase("lab");
    setAdjustmentCount(0);
    setSeenKinds(new Set());
    setSpan(10);
    setProbeX(null);
    addCurve("linear", true);
  };

  const restartLab = () => {
    nextIdRef.current = 1;
    setCurves([]);
    setSelectedId(null);
    setAdjustmentCount(0);
    setSeenKinds(new Set());
    setProbeX(null);
    setSpan(10);
    setPhase("lab");
    window.setTimeout(() => addCurve("linear", true), 0);
  };

  const updateParameter = (parameterKey: string, value: number) => {
    if (!selectedCurve) return value;
    const nextCurve = setCurveParameter(selectedCurve, parameterKey, value);
    const committedValue = nextCurve.parameters[parameterKey] ?? value;
    if (committedValue === selectedCurve.parameters[parameterKey]) return committedValue;
    setCurves((current) => current.map((curve) => (
      curve.id === selectedCurve.id
        ? nextCurve
        : curve
    )));
    setAdjustmentCount((count) => count + 1);
    setNotice({ kind: "info", text: "看，公式里的数字和图像一起变化了！" });
    return committedValue;
  };

  const selectCurve = (id: string) => {
    setSelectedId(id);
    setAnimationKey((key) => key + 1);
    const curve = curves.find((candidate) => candidate.id === id);
    if (curve) {
      setNotice({ kind: "info", text: `正在调整${curveLabel(curve)}，它会比其他曲线更亮。` });
    }
  };

  const removeCurve = (id: string) => {
    const remaining = curves.filter((curve) => curve.id !== id);
    setCurves(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
    setProbeX(null);
    setAnimationKey((key) => key + 1);
    setNotice({
      kind: "info",
      text: remaining.length ? "这条曲线已经收好，还可以从公式库点亮新的。" : "坐标舱空出来啦，从右边选一个公式开始吧。",
    });
  };

  const toggleCurve = (id: string) => {
    setCurves((current) => current.map((curve) => (
      curve.id === id ? { ...curve, visible: !curve.visible } : curve
    )));
    setAnimationKey((key) => key + 1);
  };

  const updateSpan = (requestedSpan: number) => {
    const nextSpan = normalizeGraphSpan(requestedSpan) ?? span;
    if (nextSpan === span) return span;
    setSpan(nextSpan);
    setProbeX(null);
    return nextSpan;
  };

  const zoom = (direction: "in" | "out") => {
    updateSpan(nextGraphSpan(span, direction));
  };

  if (phase === "intro") {
    return (
      <div className="mystery-page mystery-intro-page">
        <div className="mystery-starfield" aria-hidden="true" />
        <header className="mystery-topbar">
          <a href="/" className="mystery-back">← 学习大厅</a>
          <div className="mystery-brand"><span aria-hidden="true">ƒ</span><strong>神秘函数</strong></div>
          <span className="mystery-top-chip">函数图像实验室</span>
        </header>
        <main className="mystery-intro">
          <section className="mystery-intro-copy">
            <p className="mystery-eyebrow">FUNCTION ORBIT · 函数轨道舱</p>
            <h1>拨动一个数字，<em>看看曲线怎样变身。</em></h1>
            <p className="mystery-lead">
              公式像一台小机器：把 x 放进去，就会得到 y。
              同时点亮最多四台机器，观察它们画出的不同航线。
            </p>
            <div className="mystery-intro-actions">
              <button type="button" className="mystery-primary" onClick={startLab}>
                <span aria-hidden="true">▶</span> 开始探索
              </button>
              <span>不用答题 · 没有倒计时 · 随时可以重来</span>
            </div>
          </section>
          <section className="mystery-orbit-demo" aria-label="函数图像预览">
            <div className="demo-grid" aria-hidden="true" />
            <i className="demo-axis demo-axis-x" aria-hidden="true" />
            <i className="demo-axis demo-axis-y" aria-hidden="true" />
            <span className="demo-curve demo-curve-one" aria-hidden="true" />
            <span className="demo-curve demo-curve-two" aria-hidden="true" />
            <span className="demo-formula formula-one">y = x + 1</span>
            <span className="demo-formula formula-two">y = sin(x)</span>
            <span className="demo-formula formula-three">y = x²</span>
            <b className="demo-particle particle-one" aria-hidden="true" />
            <b className="demo-particle particle-two" aria-hidden="true" />
          </section>
        </main>
        <section className="mystery-family-preview" aria-label="可以探索的函数家族">
          {FUNCTION_DEFINITIONS.slice(0, 6).map((definition) => (
            <span key={definition.id}><b>{definition.baseFormula}</b>{definition.name}</span>
          ))}
        </section>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <div className="mystery-page mystery-summary-page">
        <div className="mystery-starfield" aria-hidden="true" />
        <header className="mystery-topbar">
          <a href="/" className="mystery-back">← 学习大厅</a>
          <div className="mystery-brand"><span aria-hidden="true">ƒ</span><strong>神秘函数</strong></div>
          <span className="mystery-top-chip">探索完成</span>
        </header>
        <main className="mystery-summary">
          <p className="mystery-eyebrow">ORBIT REPORT · 航线观察报告</p>
          <h1>木木点亮了 <em>{seenKinds.size}</em> 个函数家族</h1>
          <p className="summary-lead">
            你拨动了 {adjustmentCount} 次参数。公式里的数字一变化，曲线的位置、方向和弯曲也会跟着变化。
          </p>
          <section className="summary-curves" aria-label="本次最后保留的曲线">
            {curves.length === 0 ? (
              <div className="summary-empty"><strong>坐标舱里没有保留曲线</strong><span>再开一次，选一条喜欢的航线吧。</span></div>
            ) : curves.map((curve, index) => (
              <article key={curve.id} style={{ "--curve-color": CURVE_COLORS[curve.colorIndex] } as React.CSSProperties}>
                <span className="summary-index">{index + 1}</span>
                <div>
                  <small>{curveLabel(curve)}</small>
                  <strong>{curveEquation(curve)}</strong>
                  <p>{describeCurve(curve)}</p>
                </div>
              </article>
            ))}
          </section>
          <div className="summary-actions">
            <button type="button" className="mystery-primary" onClick={() => setPhase("lab")}>↩ 继续调整</button>
            <button type="button" className="mystery-secondary" onClick={restartLab}>↻ 再开一次</button>
            <a href="/" className="mystery-quiet-link">回到学习大厅</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mystery-page mystery-lab-page">
      <div className="mystery-starfield" aria-hidden="true" />
      <header className="mystery-topbar mystery-lab-topbar">
        <a href="/" className="mystery-back">← 学习大厅</a>
        <div className="mystery-brand"><span aria-hidden="true">ƒ</span><strong>神秘函数</strong></div>
        <div className="mystery-top-actions">
          <button type="button" className="mystery-top-button" onClick={restartLab}>↻ 重置实验</button>
          <button type="button" className="mystery-finish" disabled={curves.length === 0} onClick={() => setPhase("summary")}>完成探索 →</button>
        </div>
      </header>

      <main className="mystery-workspace">
        <section className="mystery-graph-panel">
          <div className="graph-heading">
            <div>
              <span className="graph-kicker">
                <i style={{ background: selectedCurve ? CURVE_COLORS[selectedCurve.colorIndex] : "#b8b7d7" }} />
                {selectedDefinition ? `${selectedDefinition.family} · 正在调整` : "坐标舱待命"}
              </span>
              <h1>{selectedCurve ? curveEquation(selectedCurve) : "选择一个公式"}</h1>
              <p>{selectedCurve ? describeCurve(selectedCurve) : "从右边的公式库点亮第一条曲线。"}</p>
            </div>
            <div className="graph-tools" aria-label="坐标图工具">
              <button type="button" onClick={() => zoom("in")} disabled={span <= MIN_GRAPH_SPAN} aria-label="放大坐标图">＋</button>
              <label className="graph-range-input">
                <span>显示 ±</span>
                <NumericCommitInput
                  value={span}
                  step={0.5}
                  minimum={MIN_GRAPH_SPAN}
                  maximum={MAX_GRAPH_SPAN}
                  label="坐标图显示范围"
                  onCommit={updateSpan}
                />
              </label>
              <button type="button" onClick={() => zoom("out")} disabled={span >= MAX_GRAPH_SPAN} aria-label="缩小坐标图">−</button>
              <button type="button" className="probe-clear" disabled={probeX === null} onClick={() => setProbeX(null)}>清除探针</button>
            </div>
          </div>

          <div className="graph-stage">
            <FunctionGraphCanvas
              curves={curves}
              selectedId={selectedId}
              span={span}
              animationKey={animationKey}
              probeX={probeX}
              onProbeX={setProbeX}
            />
            {curves.length === 0 && (
              <div className="graph-empty">
                <span aria-hidden="true">✦</span>
                <strong>坐标舱正在等待一条函数航线</strong>
                <p>从右侧公式库选择一个就可以开始。</p>
              </div>
            )}
            <div className="graph-gesture-hint">在图上按住滑动，放下 x 探针 · 双击清除</div>
          </div>

          <div className="probe-readout" aria-live="polite">
            {probeX === null ? (
              <p><span aria-hidden="true">⌖</span> 放下探针，可以比较同一个 x 在不同曲线上的 y。</p>
            ) : (
              <>
                <strong>x = {formatNumber(probeX)}</strong>
                <div>
                  {probeValues.map(({ curve, value }) => (
                    <span key={curve.id} style={{ "--curve-color": CURVE_COLORS[curve.colorIndex] } as React.CSSProperties}>
                      <i />{curveLabel(curve)}：y {value === null ? "没有图像" : `= ${formatNumber(value)}`}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="curve-dock" aria-label="当前曲线">
            {curves.map((curve, index) => (
              <article
                key={curve.id}
                className={`curve-dock-item ${curve.id === selectedId ? "is-selected" : ""} ${curve.visible ? "" : "is-hidden"}`}
                style={{ "--curve-color": CURVE_COLORS[curve.colorIndex] } as React.CSSProperties}
              >
                <button type="button" className="curve-select" onClick={() => selectCurve(curve.id)} aria-pressed={curve.id === selectedId}>
                  <span>{index + 1}</span>
                  <div><strong>{curveLabel(curve)}</strong><small>{curveEquation(curve)}</small></div>
                  <em>{curve.id === selectedId ? "正在调整" : "点我调整"}</em>
                </button>
                <div className="curve-item-actions">
                  <button type="button" onClick={() => toggleCurve(curve.id)} aria-pressed={curve.visible} aria-label={`${curve.visible ? "隐藏" : "显示"}${curveLabel(curve)}`}>
                    {curve.visible ? "可见" : "已隐藏"}
                  </button>
                  <button type="button" onClick={() => removeCurve(curve.id)} aria-label={`收起${curveLabel(curve)}`}>收起</button>
                </div>
              </article>
            ))}
            {Array.from({ length: 4 - curves.length }, (_, index) => (
              <div className="curve-empty-slot" key={`empty-${index}`}><span>＋</span><small>还可以点亮</small></div>
            ))}
          </div>
        </section>

        <aside className="mystery-control-panel">
          <section className="parameter-console">
            <div className="control-heading">
              <span>01</span>
              <div><strong>调整参数</strong><small>公式和图像会一起变化</small></div>
            </div>
            {!selectedCurve || !selectedDefinition ? (
              <div className="control-empty"><span aria-hidden="true">⌁</span><strong>还没有选中曲线</strong><p>先从下面点亮一个公式。</p></div>
            ) : (
              <>
                <div className="selected-formula" style={{ "--curve-color": CURVE_COLORS[selectedCurve.colorIndex] } as React.CSSProperties}>
                  <span>{selectedDefinition.name}</span>
                  <strong>{curveEquation(selectedCurve)}</strong>
                </div>
                <div className="parameter-list">
                  {selectedDefinition.parameters.map((parameter) => {
                    const value = selectedCurve.parameters[parameter.key]!;
                    return (
                      <div className="parameter-row" key={parameter.key}>
                        <div className="parameter-copy">
                          <span><b>{parameter.symbol}</b>{parameter.label}</span>
                          <small>每次 ±{formatNumber(parameter.step)}，也可输入</small>
                        </div>
                        <div className="parameter-input">
                          <button
                            type="button"
                            disabled={value <= (parameter.minimum ?? -PARAMETER_ABSOLUTE_LIMIT)}
                            onClick={() => updateParameter(parameter.key, value - parameter.step)}
                            aria-label={`减小${parameter.label}`}
                          >−</button>
                          <NumericCommitInput
                            className="parameter-number-input"
                            step={parameter.step}
                            value={value}
                            minimum={parameter.minimum ?? -PARAMETER_ABSOLUTE_LIMIT}
                            maximum={PARAMETER_ABSOLUTE_LIMIT}
                            onCommit={(nextValue) => updateParameter(parameter.key, nextValue)}
                            label={`${selectedDefinition.name}${parameter.label}`}
                          />
                          <button
                            type="button"
                            disabled={value >= PARAMETER_ABSOLUTE_LIMIT}
                            onClick={() => updateParameter(parameter.key, value + parameter.step)}
                            aria-label={`增大${parameter.label}`}
                          >＋</button>
                        </div>
                        <p>{parameter.meaning}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section className="formula-library">
            <div className="control-heading">
              <span>02</span>
              <div><strong>公式库</strong><small>最多同时点亮 4 条</small></div>
              <b>{curves.length} / 4</b>
            </div>
            <div className="formula-grid">
              {FUNCTION_DEFINITIONS.map((definition) => (
                <button
                  type="button"
                  key={definition.id}
                  onClick={() => addCurve(definition.id)}
                  className="formula-card"
                  aria-label={`添加${definition.name}，${definition.baseFormula}`}
                >
                  <span>{definition.name}</span>
                  <strong>{definition.baseFormula}</strong>
                  <p>{definition.shape}</p>
                  <i aria-hidden="true">＋</i>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>

      <div className={`mystery-notice notice-${notice.kind}`} role="status" aria-live="polite">
        <span aria-hidden="true">{notice.kind === "limit" ? "✦" : notice.kind === "success" ? "✓" : "⌁"}</span>
        {notice.text}
      </div>
    </div>
  );
}
