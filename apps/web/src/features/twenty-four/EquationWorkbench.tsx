import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { cardMark, formatFraction, OPERATORS, SYMBOLS } from "../../../../server/src/twenty-four-engine";
import { canGroup, editorResult, type EquationEditor } from "../../../../server/src/twenty-four-editor";

type Selection = { type: "number" | "operator"; index: number } | null;
export function EquationWorkbench({ cards, editor, locked, completed, canUndo, onEdit, onSubmit, onUndo, onReset, tools }: {
  cards: number[]; editor: EquationEditor; locked: boolean; completed: boolean; canUndo: boolean; tools?: ReactNode;
  onEdit: (editor: EquationEditor) => void; onSubmit: () => void; onUndo: () => void; onReset: () => void;
}) {
  const [selection, setSelection] = useState<Selection>(null), [feedback, setFeedback] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pairing = editor.pendingStart !== null;
  const numberTarget = selection?.type === "number" ? selection.index : editor.slots.indexOf(null);
  const operatorTarget = selection?.type === "operator" ? selection.index : editor.operators.indexOf(null);
  useEffect(() => { setFeedback(""); }, [editor]);
  function edit(next: EquationEditor) { setFeedback(""); setSelection(null); onEdit(next); }
  function check() {
    try {
      const value = editorResult(editor, cards);
      if (value.n === 24n * value.d) onSubmit();
      else setFeedback(`算出来是 ${formatFraction(value)}，再调整一下吧`);
    } catch (e) { setFeedback(e instanceof Error ? e.message : "先把算式填完整吧"); }
  }
  const bracketColor = (index: number) => ["var(--cyan-300)", "var(--pink-400)"][index % 2];
  return <div className="tf-equation-editor" onKeyDown={event => {
    if (event.key === "Escape") { setSelection(null); trigger.current?.focus({ preventScroll: true }); }
  }}>
    <div className="tf-editor-caption" role="status">
      <strong>{completed ? "✓ 正好 24！" : pairing ? `请在第 ${editor.pendingStart! + 1} 格右侧选一个合上位置` : "选四个数字，算出 24"}</strong>
      {pairing ? <button disabled={locked} onClick={() => edit({ ...editor, pendingStart: null })}>取消括号</button> : <span>先括号，再乘除，后加减</span>}
    </div>
    <div className="tf-equation-scroll" tabIndex={0} aria-label="四格算式，小屏可左右滑动">
      <div className="tf-four-slots">
        {[0, 1, 2, 3].map(index => {
          const card = editor.slots[index], value = card === null ? null : cards[card];
          const open = editor.groups.findIndex(g => g.start === index), close = editor.groups.findIndex(g => g.end === index);
          const canOpen = [1, 2, 3].some(end => canGroup(editor.groups, index, end));
          const canClose = pairing && canGroup(editor.groups, editor.pendingStart!, index);
          const op = editor.operators[index];
          return <Fragment key={index}>
            <div className="tf-slot">
              <button className={`tf-number-slot ${selection?.type === "number" && selection.index === index ? "is-selected" : ""}`}
                disabled={locked || pairing} aria-pressed={selection?.type === "number" && selection.index === index}
                aria-controls="tf-numbers" aria-label={`第 ${index + 1} 格数字，当前 ${value ?? "空"}，点击选择`}
                onClick={event => { trigger.current = event.currentTarget; setSelection({ type: "number", index }); }}>
                <span className="tf-slot-label">第 {index + 1} 格</span>
                <span className="tf-slot-content"><span className="tf-large-brackets" aria-hidden="true" style={{ color: bracketColor(open) }}>{open >= 0 ? "(" : editor.pendingStart === index ? <span className="tf-unpaired">(</span> : ""}</span>
                  <span className="tf-slot-number">{value === null ? <span className="tf-slot-placeholder">选数字</span> : <><b>{value}</b><small>{cardMark(value) !== String(value) ? `${cardMark(value)} = ${value}` : "点击换数"}</small></>}</span>
                  <span className="tf-large-brackets" aria-hidden="true" style={{ color: bracketColor(close) }}>{close >= 0 ? ")" : ""}</span></span>
              </button>
              <div className="tf-bracket-tools">
                <button disabled={locked || pairing || !canOpen} aria-label={`在第 ${index + 1} 格左边加左括号`}
                  onClick={() => edit({ ...editor, pendingStart: index })}><b>(</b><span>左括号</span></button>
                <button className={canClose ? "tf-close-target" : ""} disabled={locked || (pairing ? !canClose : close < 0)}
                  aria-label={pairing ? `在第 ${index + 1} 格右边配右括号` : `移除第 ${index + 1} 格右边的一对括号`}
                  onClick={() => pairing ? edit({ ...editor, groups: [...editor.groups, { start: editor.pendingStart!, end: index }], pendingStart: null })
                    : edit({ ...editor, groups: editor.groups.filter((_, i) => i !== close) })}>
                  <b>)</b><span>{pairing ? "合上" : close >= 0 ? "去掉" : "右括号"}</span>
                </button>
              </div>
            </div>
            {index < 3 && <div className="tf-connector">
              <button className={selection?.type === "operator" && selection.index === index ? "is-selected" : ""} disabled={locked || pairing}
                aria-pressed={selection?.type === "operator" && selection.index === index} aria-controls="tf-operations"
                aria-label={`第 ${index + 1} 个运算符，当前 ${op === null ? "空" : SYMBOLS[op]}，点击选择`}
                onClick={event => { trigger.current = event.currentTarget; setSelection({ type: "operator", index }); }}>
                {op === null ? <span>符号</span> : <b>{SYMBOLS[op]}</b>}
              </button>
            </div>}
          </Fragment>;
        })}
      </div>
    </div>
    {!completed && <div className="tf-available">
      <div id="tf-numbers" className="tf-number-pool">
        <div className="tf-choice-title"><strong>可用数字</strong><span>{numberTarget >= 0 ? `点数字放入第 ${numberTarget + 1} 格` : "点上方格子可换数"}</span></div>
        <div className="tf-choice-grid">{cards.map((value, card) => {
          const usedAt = editor.slots.indexOf(card), current = selection?.type === "number" && usedAt === selection.index;
          return <button key={card} disabled={locked || pairing || usedAt >= 0 || numberTarget < 0} aria-pressed={current} className={current ? "is-selected" : ""}
            aria-label={`候选第 ${card + 1} 张，数字 ${value}${usedAt >= 0 ? `，第 ${usedAt + 1} 格已用` : "，可用"}`}
            onClick={() => edit({ ...editor, slots: editor.slots.map((id, i) => i === numberTarget ? card : id) })}>
            <b>{value}</b><small>{usedAt >= 0 ? `第${usedAt + 1}格已用` : cardMark(value) !== String(value) ? `${cardMark(value)} = ${value}` : "可用"}</small>
          </button>;
        })}</div>
      </div>
      <div id="tf-operations" className="tf-operation-pool">
        <div className="tf-choice-title"><strong>运算</strong><span>{operatorTarget >= 0 ? `填第 ${operatorTarget + 1} 处` : "点符号可更换"}</span></div>
        <div className="tf-choice-grid is-operators">{OPERATORS.map(op => <button key={op} disabled={locked || pairing || operatorTarget < 0}
          aria-label={`选择${({ "+": "加法", "-": "减法", "*": "乘法", "/": "除法" })[op]}`}
          onClick={() => edit({ ...editor, operators: editor.operators.map((value, i) => i === operatorTarget ? op : value) })}>
          <b>{SYMBOLS[op]}</b><small>{({ "+": "加法", "-": "减法", "*": "乘法", "/": "除法" })[op]}</small>
        </button>)}</div>
      </div>
    </div>}
    {!completed && <div className="tf-editor-bottom">
      <div className="tf-editor-actions"><button disabled={locked || !canUndo} onClick={() => { setSelection(null); onUndo(); }}>↶ 撤销</button><button disabled={locked} onClick={() => { setSelection(null); onReset(); }}>清空</button>{tools}</div>
      <div className="tf-check"><span>= <b>24</b></span><button className="tf-primary" disabled={locked || pairing || editor.slots.some(n => n === null) || editor.operators.some(op => op === null)} onClick={check}>算好了 ✓</button></div>
    </div>}
    {feedback && <p className="tf-editor-feedback" role="status">{feedback}</p>}
  </div>;
}
