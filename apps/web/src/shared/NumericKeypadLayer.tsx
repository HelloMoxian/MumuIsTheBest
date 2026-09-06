import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  NUMERIC_KEYPAD_MAX_DIGITS,
  NUMERIC_KEYPAD_OPEN_EVENT,
  appendNumericKeypadDigit,
  formatChineseInteger,
  openNumericKeypad,
  placeValueLabel,
  submitNumericKeypadValue,
} from "./numeric-keypad";
import "./numeric-keypad.css";

const KEYPAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;

export function NumericKeypadLayer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState("");
  const [announcement, setAnnouncement] = useState("数字键盘已准备好");
  const placeRowRef = useRef<HTMLDivElement | null>(null);
  const isHome = window.location.pathname === "/";
  const isImmersiveCameraGame = [
    "/games/sudoku",
    "/games/tetris",
    "/games/gem-connect",
    "/games/fruit-slice",
    "/games/galaxy-racer",
    "/games/bejeweled",
  ].includes(window.location.pathname);
  const value = digits ? Number(digits) : null;
  const spokenValue = useMemo(
    () => value === null ? "还没有输入数字" : formatChineseInteger(value),
    [value],
  );

  useEffect(() => {
    const toggle = () => {
      setOpen((current) => {
        const next = !current;
        setAnnouncement(next ? "数字键盘已在右侧展开" : "数字键盘已经收起");
        return next;
      });
    };
    window.addEventListener(NUMERIC_KEYPAD_OPEN_EVENT, toggle);
    return () => window.removeEventListener(NUMERIC_KEYPAD_OPEN_EVENT, toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!digits) return;
    const row = placeRowRef.current;
    if (row) row.scrollLeft = row.scrollWidth;
  }, [digits]);

  const addDigit = (digit: number) => {
    setDigits((current) => {
      const next = appendNumericKeypadDigit(current, digit);
      setAnnouncement(next === current && current.length >= NUMERIC_KEYPAD_MAX_DIGITS
        ? `最多可以输入 ${NUMERIC_KEYPAD_MAX_DIGITS} 位数字`
        : `现在是 ${formatChineseInteger(Number(next))}`);
      return next;
    });
  };

  const clear = () => {
    setDigits("");
    setAnnouncement("数字已经清空");
  };

  const submit = () => {
    if (!digits || value === null) return;
    const accepted = submitNumericKeypadValue({ digits, value });
    if (!accepted) {
      setAnnouncement("当前页面还没有等待数字的任务，请先进入一个数学玩法");
      return;
    }
    setAnnouncement(`已经提交 ${spokenValue}`);
    setDigits("");
  };

  if (isImmersiveCameraGame) return <>{children}</>;

  return (
    <>
      {children}
      {!isHome && (
        <button
          className="numeric-keypad-launcher is-floating"
          type="button"
          onClick={openNumericKeypad}
          aria-expanded={open}
          aria-controls="numeric-keypad-panel"
        >
          <span aria-hidden="true">123</span> 数字键盘
        </button>
      )}

      <span className="numeric-keypad-live" aria-live="polite">{announcement}</span>

      {open && (
        <aside
          id="numeric-keypad-panel"
          className={`numeric-keypad-panel ${isHome ? "is-home" : "is-page"}`}
          aria-labelledby="numeric-keypad-title"
        >
            <header className="numeric-keypad-heading">
              <div>
                <span>123 · 辅助工具</span>
                <h2 id="numeric-keypad-title">数字键盘</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭数字键盘"
              >
                ×
              </button>
            </header>

            <div className={`numeric-place-display ${digits ? "has-value" : "is-empty"}`}>
              {digits ? (
                <div ref={placeRowRef} className="numeric-place-row" aria-label={`当前数字 ${digits}，读作${spokenValue}`}>
                  {[...digits].map((digit, index) => (
                    <div className="numeric-place-cell" key={`${index}-${digit}`}>
                      <span>{placeValueLabel(digits.length - index - 1)}</span>
                      <strong>{digit}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <strong className="numeric-empty-copy">点一个数字开始</strong>
              )}
              <p><span>读作</span><strong>{spokenValue}</strong></p>
            </div>

            <div className="numeric-key-grid" aria-label="零至九数字按钮">
              {KEYPAD_DIGITS.map((digit) => (
                <button type="button" key={digit} onClick={() => addDigit(digit)}>
                  <strong>{digit}</strong>
                  <span>{formatChineseInteger(digit)}</span>
                </button>
              ))}
            </div>

            <p className="numeric-keypad-status" role="status" aria-live="polite">
              {announcement}
            </p>

            <footer className="numeric-keypad-actions">
              <button type="button" className="is-clear" onClick={clear} disabled={!digits}>
                清空
              </button>
              <button type="button" className="is-submit" onClick={submit} disabled={!digits}>
                提交这个数字
              </button>
            </footer>
        </aside>
      )}
    </>
  );
}
