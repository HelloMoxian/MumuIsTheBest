import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_GLOBAL_GAMEPAD_BINDINGS, chooseSpatialIndex, isNumericDraft, moveGridIndex, nextSteppedValue, parseGlobalGamepadBindings, type GamepadDirection, type GlobalGamepadBindings } from "./gamepad-navigation";
import "./gamepad-navigation.css";

type FocusTarget = HTMLElement | SVGElement;
type InteractionMode = "navigation" | "adjust" | "control";
type Overlay = { left: number; top: number; width: number; height: number; kind: "orb" | "frame" } | null;
type NumericEditor = { target: HTMLInputElement | HTMLTextAreaElement; draft: string; original: string };
type PadAction = "up" | "down" | "left" | "right" | "accept" | "back" | "secondary" | "columnSwitch" | "fullscreenToggle" | "fullscreenEnter" | "fullscreenExit";
type BindingAction = Exclude<keyof GlobalGamepadBindings, "schemaVersion">;

export const GLOBAL_GAMEPAD_SETTINGS_EVENT = "mumu:global-gamepad-settings";
const BINDINGS_STORAGE_KEY = "mumu.global-gamepad-bindings.v1";
const BUTTON_NAMES = ["A / ×", "B / ○", "X / □", "Y / △", "LB / L1", "RB / R1", "LT / L2", "RT / R2", "选择 / Share", "菜单 / Start", "左摇杆按下", "右摇杆按下", "十字键上", "十字键下", "十字键左", "十字键右", "主页键"];
const BINDING_LABELS: Record<BindingAction, string> = {
  accept: "确认、点击与进入编辑",
  back: "完成编辑与返回",
  columnSwitch: "栏目切换",
  fullscreenEnter: "快速进入全屏",
  fullscreenExit: "快速退出全屏",
};

const INTERACTIVE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled]):not([type='hidden']):not([type='file'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='gridcell']",
  "[role='slider']",
  "[tabindex]:not([tabindex='-1'])",
  "canvas[aria-label]",
].join(",");

const NUMERIC_KEYS = [
  { label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" }, { label: "退格", action: "backspace" },
  { label: "4", value: "4" }, { label: "5", value: "5" }, { label: "6", value: "6" }, { label: "清空", action: "clear" },
  { label: "7", value: "7" }, { label: "8", value: "8" }, { label: "9", value: "9" }, { label: "正负", action: "sign" },
  { label: "取消", action: "cancel" }, { label: "0", value: "0" }, { label: "小数点", value: "." }, { label: "完成", action: "done" },
] as const;

const directionKey: Record<GamepadDirection, { key: string; code: string; wasd: string; wasdCode: string }> = {
  left: { key: "ArrowLeft", code: "ArrowLeft", wasd: "a", wasdCode: "KeyA" },
  right: { key: "ArrowRight", code: "ArrowRight", wasd: "d", wasdCode: "KeyD" },
  up: { key: "ArrowUp", code: "ArrowUp", wasd: "w", wasdCode: "KeyW" },
  down: { key: "ArrowDown", code: "ArrowDown", wasd: "s", wasdCode: "KeyS" },
};

function isVisible(target: Element) {
  const rect = target.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = getComputedStyle(target);
  return style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none" && style.opacity !== "0";
}

function isUnavailable(target: Element) {
  return target.matches("[disabled], [aria-disabled='true'], [hidden], [inert]")
    || Boolean(target.closest("[hidden], [inert], [aria-hidden='true']"));
}

function labelFor(target: Element) {
  const labelledBy = target.getAttribute("aria-labelledby");
  const labelled = labelledBy?.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
  return target.getAttribute("aria-label")?.trim()
    || labelled
    || target.textContent?.replace(/\s+/g, " ").trim()
    || target.getAttribute("title")
    || "当前控件";
}

function modalScope(): Element | null {
  const native = [...document.querySelectorAll("dialog[open]")].filter(isVisible).at(-1);
  if (native) return native;
  return [...document.querySelectorAll("[role='dialog'][aria-modal='true']")].filter(isVisible).at(-1) ?? null;
}

function focusTargets() {
  const scope = modalScope() ?? document.body;
  return [...scope.querySelectorAll(INTERACTIVE_SELECTOR)].filter((target): target is FocusTarget => {
    if (!(target instanceof HTMLElement || target instanceof SVGElement) || isUnavailable(target) || !isVisible(target)) return false;
    if (target.matches(".drawing-canvas, .symmetry-canvas-shell canvas")) return false;
    if (target instanceof HTMLInputElement && target.type === "file") return false;
    return true;
  });
}

function canAdjust(target: Element) {
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return ["range", "number", "date", "datetime-local", "time", "month", "week"].includes(target.type);
  return target.getAttribute("role") === "slider";
}

function acceptsNumericText(target: Element): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ["text", "search", "tel", "password", "url", "email"].includes(target.type);
}

function isControlSurface(target: Element) {
  if (target.matches("canvas")) return true;
  if (target.matches("[data-gamepad-surface], [role='application']")) return true;
  const label = labelFor(target);
  return target.hasAttribute("tabindex") && /方向键|WASD|棋盘|画布|地图|转动/.test(label);
}

function focusElement(target: FocusTarget) {
  if ("focus" in target && typeof target.focus === "function") target.focus({ preventScroll: true });
}

function clickElement(target: FocusTarget) {
  if (target instanceof HTMLElement) target.click();
  else target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}

function setNativeValue(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchControlKey(target: FocusTarget, direction: GamepadDirection, type: "keydown" | "keyup", repeat = false) {
  const mapping = directionKey[direction];
  const useWasd = /WASD/i.test(labelFor(target));
  const event = new KeyboardEvent(type, {
    key: useWasd ? mapping.wasd : mapping.key,
    code: useWasd ? mapping.wasdCode : mapping.code,
    bubbles: true,
    cancelable: true,
    repeat,
  });
  target.dispatchEvent(event);
}

function dispatchPrimaryControl(target: FocusTarget, secondary = false) {
  const useWasd = /WASD/i.test(labelFor(target));
  const event = new KeyboardEvent("keydown", {
    key: useWasd ? secondary ? "k" : "j" : secondary ? "Shift" : " ",
    code: useWasd ? secondary ? "KeyK" : "KeyJ" : secondary ? "ShiftLeft" : "Space",
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  target.dispatchEvent(new KeyboardEvent("keyup", { key: event.key, code: event.code, bubbles: true }));
}

function adjustTarget(target: FocusTarget, direction: GamepadDirection) {
  const delta = direction === "left" || direction === "down" ? -1 : 1;
  if (target instanceof HTMLSelectElement) {
    const enabled = [...target.options].map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled);
    const current = enabled.findIndex(({ index }) => index === target.selectedIndex);
    const next = enabled[Math.max(0, Math.min(enabled.length - 1, current + delta))];
    if (!next || next.index === target.selectedIndex) return;
    target.selectedIndex = next.index;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (target instanceof HTMLInputElement) {
    if (["date", "datetime-local", "time", "month", "week"].includes(target.type)) {
      try { delta > 0 ? target.stepUp() : target.stepDown(); } catch { return; }
    } else {
      const value = Number(target.value || target.min || 0);
      const next = nextSteppedValue(value, direction, {
        min: target.min === "" ? undefined : Number(target.min),
        max: target.max === "" ? undefined : Number(target.max),
        step: target.step === "any" || target.step === "" ? 1 : Number(target.step),
      });
      setNativeValue(target, String(next));
      return;
    }
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const mapping = directionKey[direction];
  target.dispatchEvent(new KeyboardEvent("keydown", { key: mapping.key, code: mapping.code, bubbles: true, cancelable: true }));
}

function buttonValue(pad: Gamepad, index: number) {
  const button = pad.buttons[index];
  return Boolean(button?.pressed || (button?.value ?? 0) >= .55);
}

function readSavedBindings() {
  try { return parseGlobalGamepadBindings(JSON.parse(localStorage.getItem(BINDINGS_STORAGE_KEY) ?? "null")) ?? DEFAULT_GLOBAL_GAMEPAD_BINDINGS; }
  catch { return DEFAULT_GLOBAL_GAMEPAD_BINDINGS; }
}

function fullscreenActive() {
  return Boolean(document.fullscreenElement || document.body.hasAttribute("data-site-fullscreen")
    || [...document.querySelectorAll("[data-fullscreen-exit]")].some(isVisible));
}

function readPadActions(pad: Gamepad, bindings: GlobalGamepadBindings): Record<PadAction, boolean> {
  const horizontal = Math.abs(pad.axes[0] ?? 0) >= .55 ? pad.axes[0] : 0;
  const vertical = Math.abs(pad.axes[1] ?? 0) >= .55 ? pad.axes[1] : 0;
  const sharedFullscreen = bindings.fullscreenEnter === bindings.fullscreenExit;
  return {
    left: buttonValue(pad, 14) || horizontal < 0,
    right: buttonValue(pad, 15) || horizontal > 0,
    up: buttonValue(pad, 12) || vertical < 0,
    down: buttonValue(pad, 13) || vertical > 0,
    accept: buttonValue(pad, bindings.accept),
    back: buttonValue(pad, bindings.back),
    secondary: buttonValue(pad, 2),
    columnSwitch: buttonValue(pad, bindings.columnSwitch),
    fullscreenToggle: sharedFullscreen && buttonValue(pad, bindings.fullscreenEnter),
    fullscreenEnter: !sharedFullscreen && buttonValue(pad, bindings.fullscreenEnter),
    fullscreenExit: !sharedFullscreen && buttonValue(pad, bindings.fullscreenExit),
  };
}

export function GlobalGamepadNavigation({ children }: { children: ReactNode }) {
  const active = useRef<FocusTarget | null>(null);
  const mode = useRef<InteractionMode>("navigation");
  const numberEditor = useRef<NumericEditor | null>(null);
  const numericIndexRef = useRef(0);
  const bindingsRef = useRef<GlobalGamepadBindings>(readSavedBindings());
  const captureRef = useRef<{ action: BindingAction; ready: boolean; started: number } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [connected, setConnected] = useState(false);
  const [label, setLabel] = useState("");
  const [modeView, setModeView] = useState<InteractionMode>("navigation");
  const [numeric, setNumeric] = useState<NumericEditor | null>(null);
  const [numericIndex, setNumericIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [bindings, setBindings] = useState(bindingsRef.current);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureBinding, setCaptureBinding] = useState<BindingAction | null>(null);

  const syncOverlay = useCallback(() => {
    const target = active.current;
    if (!target?.isConnected || !isVisible(target)) {
      setOverlay(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const kind = mode.current === "navigation" ? "orb" : "frame";
    setOverlay(previous => previous
      && previous.left === rect.left && previous.top === rect.top
      && previous.width === rect.width && previous.height === rect.height && previous.kind === kind
      ? previous
      : { left: rect.left, top: rect.top, width: rect.width, height: rect.height, kind });
  }, []);

  const setMode = useCallback((next: InteractionMode) => {
    mode.current = next;
    setModeView(next);
    syncOverlay();
  }, [syncOverlay]);

  const choose = useCallback((target: FocusTarget | null, scroll = true) => {
    active.current?.removeAttribute("data-gamepad-focus");
    active.current = target;
    if (!target) {
      setLabel("");
      setOverlay(null);
      return;
    }
    target.setAttribute("data-gamepad-focus", "true");
    focusElement(target);
    setLabel(labelFor(target));
    if (scroll) {
      const rect = target.getBoundingClientRect();
      if (rect.top < 72 || rect.bottom > window.innerHeight - 48 || rect.left < 0 || rect.right > window.innerWidth) {
        target.scrollIntoView({ block: "center", inline: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    }
    window.requestAnimationFrame(syncOverlay);
  }, [syncOverlay]);

  const closeNumeric = useCallback((commit: boolean) => {
    const editor = numberEditor.current;
    if (commit && editor && isNumericDraft(editor.draft) && editor.draft !== "" && editor.draft !== "-" && editor.draft !== ".") {
      setNativeValue(editor.target, editor.draft);
      setAnnouncement(`已输入 ${editor.draft}`);
    } else if (!commit) setAnnouncement("已取消数字输入");
    numberEditor.current = null;
    setNumeric(null);
    setMode("navigation");
    if (editor?.target.isConnected) choose(editor.target, false);
  }, [choose, setMode]);

  const updateNumeric = useCallback((updater: (draft: string) => string) => {
    const editor = numberEditor.current;
    if (!editor) return;
    const draft = updater(editor.draft);
    if (!isNumericDraft(draft)) return;
    const next = { ...editor, draft };
    numberEditor.current = next;
    setNumeric(next);
  }, []);

  const activateNumericKey = useCallback(() => {
    const key = NUMERIC_KEYS[numericIndexRef.current];
    if (!key) return;
    if ("value" in key) updateNumeric(draft => draft === "0" && key.value !== "." ? key.value : draft + key.value);
    else if (key.action === "backspace") updateNumeric(draft => draft.slice(0, -1));
    else if (key.action === "clear") updateNumeric(() => "");
    else if (key.action === "sign") updateNumeric(draft => draft.startsWith("-") ? draft.slice(1) : "-" + draft);
    else if (key.action === "cancel") closeNumeric(false);
    else if (key.action === "done") closeNumeric(true);
  }, [closeNumeric, updateNumeric]);

  const beginNumeric = useCallback((target: HTMLInputElement | HTMLTextAreaElement) => {
    const original = target.value;
    const draft = isNumericDraft(original) ? original : "";
    const editor = { target, original, draft };
    numberEditor.current = editor;
    numericIndexRef.current = 0;
    setNumericIndex(0);
    setNumeric(editor);
    setAnnouncement("数字输入已打开，方向键选择，A 键输入，B 键取消");
    setMode("adjust");
  }, [setMode]);

  const moveFocus = useCallback((direction: GamepadDirection) => {
    const targets = focusTargets();
    if (!targets.length) return;
    let current = active.current && targets.includes(active.current) ? targets.indexOf(active.current) : -1;
    if (current < 0) {
      const focused = document.activeElement;
      current = focused && targets.includes(focused as FocusTarget) ? targets.indexOf(focused as FocusTarget) : -1;
    }
    if (current < 0) {
      choose(targets[0]);
      return;
    }
    const rects = targets.map(target => target.getBoundingClientRect());
    const next = chooseSpatialIndex(current, rects, direction);
    if (next >= 0) choose(targets[next]);
    else {
      const ordered = targets.map((target, index) => ({ target, index, rect: rects[index] }))
        .sort((a, b) => direction === "up" || direction === "down" ? a.rect.top - b.rect.top || a.rect.left - b.rect.left : a.rect.left - b.rect.left || a.rect.top - b.rect.top);
      const fallback = direction === "up" || direction === "left" ? ordered.at(-1) : ordered[0];
      if (fallback) choose(fallback.target);
    }
  }, [choose]);

  const switchColumn = useCallback(() => {
    if (numberEditor.current || mode.current !== "navigation" || modalScope()) {
      setAnnouncement("请先按 B 完成当前操作，再切换栏目");
      return;
    }
    const groups = [...document.querySelectorAll<HTMLElement>("[data-gamepad-columns], [role='tablist']")].filter(isVisible);
    const group = groups.find(candidate => active.current && candidate.contains(active.current))
      ?? groups.find(candidate => [...candidate.querySelectorAll("[aria-selected='true'], [aria-pressed='true'], .is-selected")].some(isVisible))
      ?? groups[0];
    const items = group ? [...group.querySelectorAll<FocusTarget>("[role='tab'], button:not(:disabled), a[href]")]
      .filter(target => !isUnavailable(target) && isVisible(target)) : [];
    if (!items.length) {
      setAnnouncement("当前页面没有可切换的栏目");
      return;
    }
    let current = active.current ? items.indexOf(active.current) : -1;
    if (current < 0) current = items.findIndex(item => item.matches("[aria-selected='true'], [aria-pressed='true'], .is-selected"));
    if (current < 0 && window.location.hash) current = items.findIndex(item => item instanceof HTMLAnchorElement && item.hash === window.location.hash);
    const next = items[(current + 1 + items.length) % items.length];
    choose(next);
    clickElement(next);
    setAnnouncement(`已切换到${labelFor(next)}`);
  }, [choose]);

  const activate = useCallback(() => {
    const target = active.current;
    if (!target?.isConnected) {
      const first = focusTargets()[0];
      if (first) choose(first);
      return;
    }
    if (mode.current === "adjust") {
      setAnnouncement("正在调节；按 B 完成编辑");
      return;
    }
    if (canAdjust(target)) {
      setMode("adjust");
      setAnnouncement("调节中，使用方向键修改，B 完成编辑");
      return;
    }
    if (acceptsNumericText(target)) {
      beginNumeric(target);
      return;
    }
    if (isControlSurface(target)) {
      setMode("control");
      setAnnouncement("操控中，使用方向键，A 是主要动作，B 完成并退出操控");
      return;
    }
    clickElement(target);
    window.requestAnimationFrame(() => {
      if (!target.isConnected || modalScope()) choose(focusTargets()[0] ?? null);
      else syncOverlay();
    });
  }, [beginNumeric, choose, setMode, syncOverlay]);

  const goBack = useCallback(() => {
    if (numberEditor.current) { closeNumeric(false); return; }
    if (mode.current !== "navigation") {
      setMode("navigation");
      setAnnouncement("已完成编辑并退出当前操作");
      return;
    }
    const modal = modalScope();
    if (modal) {
      const buttons = [...modal.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]")].filter(isVisible);
      const close = buttons.find(button => /关闭|取消|返回|接着玩|保留这局|继续/.test(labelFor(button)));
      if (close) close.click();
      else if (modal instanceof HTMLDialogElement) {
        const cancel = new Event("cancel", { bubbles: false, cancelable: true });
        if (modal.dispatchEvent(cancel)) modal.close();
      }
      window.requestAnimationFrame(() => choose(focusTargets()[0] ?? null));
      return;
    }
    const fullscreenExit = [...document.querySelectorAll<HTMLElement>("[data-fullscreen-exit]:not(:disabled)")].find(isVisible);
    if (fullscreenExit) { fullscreenExit.click(); return; }
    const siteExit = [...document.querySelectorAll<HTMLElement>(".site-fullscreen-floating:not(:disabled)")].find(isVisible);
    if (siteExit) { siteExit.click(); return; }
    const back = [...document.querySelectorAll<HTMLElement>(".game-topbar__back, a[aria-label^='返回']")].find(target => isVisible(target) && !isUnavailable(target));
    if (back) { back.click(); return; }
    if (window.location.pathname !== "/") window.location.assign("/");
  }, [choose, closeNumeric, setMode]);

  const setFullscreen = useCallback((desired: "toggle" | "enter" | "exit") => {
    const activeNow = fullscreenActive();
    if ((desired === "enter" && activeNow) || (desired === "exit" && !activeNow)) return;
    const shouldExit = desired === "exit" || (desired === "toggle" && activeNow);
    const controls = [...document.querySelectorAll<HTMLElement>("button:not(:disabled)")].filter(isVisible);
    const button = shouldExit
      ? [...document.querySelectorAll<HTMLElement>("[data-fullscreen-exit]:not(:disabled), .site-fullscreen-floating:not(:disabled)")].find(isVisible)
        ?? controls.find(target => /退出全屏/.test(labelFor(target)))
      : controls.find(target => /全屏模式|全屏游戏|全屏沉浸|全屏跟练|全屏绘画|全屏搭建|^⛶?\s*全屏$/.test(labelFor(target)) && !/退出/.test(labelFor(target)));
    if (button) {
      button.click();
      setAnnouncement(labelFor(button));
    } else {
      window.dispatchEvent(new CustomEvent("mumu:site-fullscreen-request", { detail: { active: !shouldExit } }));
      setAnnouncement(shouldExit ? "正在退出全屏" : "正在进入全屏");
    }
  }, []);

  const saveBindings = useCallback((next: GlobalGamepadBindings) => {
    bindingsRef.current = next;
    setBindings(next);
    try { localStorage.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(next)); }
    catch { setAnnouncement("浏览器暂时无法保存键位，本次仍可使用"); }
  }, []);

  const beginBindingCapture = useCallback((action: BindingAction) => {
    captureRef.current = { action, ready: false, started: performance.now() };
    setCaptureBinding(action);
    setAnnouncement(`请松开按键，再按下“${BINDING_LABELS[action]}”的新按键`);
  }, []);

  const finishBindingCapture = useCallback((button: number) => {
    const capture = captureRef.current;
    if (!capture) return;
    const current = bindingsRef.current;
    const fullscreenAction = capture.action === "fullscreenEnter" || capture.action === "fullscreenExit";
    const conflict = fullscreenAction
      ? button === current.accept || button === current.back || button === current.columnSwitch
      : Object.entries(current).some(([key, value]) => key !== "schemaVersion" && key !== capture.action && value === button);
    if (conflict) {
      setAnnouncement("这个按键已用于另一项操作；进入和退出全屏可以共用，其他功能请选不同按键");
      captureRef.current = { ...capture, ready: false, started: performance.now() };
      return;
    }
    const next = { ...current, [capture.action]: button };
    saveBindings(next);
    captureRef.current = null;
    setCaptureBinding(null);
    setAnnouncement(`${BINDING_LABELS[capture.action]}已设置为 ${BUTTON_NAMES[button] ?? `按钮 ${button + 1}`}`);
  }, [saveBindings]);

  const handleAction = useCallback((action: PadAction, type: "press" | "repeat" | "release") => {
    if (type === "press" && action === "fullscreenToggle") { setFullscreen("toggle"); return; }
    if (type === "press" && action === "fullscreenEnter") { setFullscreen("enter"); return; }
    if (type === "press" && action === "fullscreenExit") { setFullscreen("exit"); return; }
    const nativeGame = document.querySelector<HTMLElement>("[data-gamepad-native='playing']");
    if (nativeGame) {
      if (action === "back" && type === "press") nativeGame.querySelector<HTMLElement>("[data-gamepad-pause]")?.click();
      return;
    }
    if (type === "press" && action === "columnSwitch") { switchColumn(); return; }
    const editor = numberEditor.current;
    if (editor) {
      if (type !== "press" && type !== "repeat") return;
      if (["up", "down", "left", "right"].includes(action)) {
        const next = moveGridIndex(numericIndexRef.current, action as GamepadDirection, 4, NUMERIC_KEYS.length);
        numericIndexRef.current = next;
        setNumericIndex(next);
      } else if (action === "accept" && type === "press") activateNumericKey();
      else if (action === "secondary" && type === "press") updateNumeric(draft => draft.slice(0, -1));
      else if (action === "back" && type === "press") closeNumeric(false);
      return;
    }
    if (["up", "down", "left", "right"].includes(action)) {
      const direction = action as GamepadDirection;
      if (mode.current === "control") {
        if (active.current) dispatchControlKey(active.current, direction, type === "release" ? "keyup" : "keydown", type === "repeat");
      } else if (type !== "release") {
        if (mode.current === "adjust") {
          if (active.current) adjustTarget(active.current, direction);
        } else moveFocus(direction);
      }
      return;
    }
    if (type !== "press") return;
    if (action === "accept") {
      if (mode.current === "control" && active.current) dispatchPrimaryControl(active.current);
      else activate();
    } else if (action === "secondary") {
      if (mode.current === "control" && active.current) dispatchPrimaryControl(active.current, true);
      else if (acceptsNumericText(active.current ?? document.body)) beginNumeric(active.current as HTMLInputElement | HTMLTextAreaElement);
    } else if (action === "back") goBack();
  }, [activate, activateNumericKey, beginNumeric, closeNumeric, goBack, moveFocus, setFullscreen, switchColumn, updateNumeric]);

  useEffect(() => {
    let frame = 0;
    let armed = false;
    const previous: Partial<Record<PadAction, boolean>> = {};
    const repeats: Partial<Record<PadAction, number>> = {};
    const actions: PadAction[] = ["up", "down", "left", "right", "accept", "back", "secondary", "columnSwitch", "fullscreenToggle", "fullscreenEnter", "fullscreenExit"];
    const poll = (now: number) => {
      let pads: Gamepad[] = [];
      try { pads = [...navigator.getGamepads()].filter((candidate): candidate is Gamepad => Boolean(candidate?.connected)); } catch { pads = []; }
      setConnected(current => current === Boolean(pads.length) ? current : Boolean(pads.length));
      if (!pads.length || document.hidden || !document.hasFocus()) {
        armed = false;
        actions.forEach(action => { previous[action] = false; delete repeats[action]; });
        frame = requestAnimationFrame(poll);
        return;
      }
      const capture = captureRef.current;
      if (capture) {
        const pressed = pads.flatMap(pad => pad.buttons.map((button, index) => ({ button, index }))).find(({ button }) => button.pressed || button.value >= .55);
        if (!capture.ready) {
          if (!pressed) capture.ready = true;
        } else if (pressed) finishBindingCapture(pressed.index);
        if (now - capture.started > 10_000) {
          captureRef.current = null;
          setCaptureBinding(null);
          setAnnouncement("等待按键已结束，可以重新选择设置");
        }
        frame = requestAnimationFrame(poll);
        return;
      }
      const samples = pads.map(pad => readPadActions(pad, bindingsRef.current));
      const state = Object.fromEntries(actions.map(action => [action, samples.some(sample => sample[action])])) as Record<PadAction, boolean>;
      if (!armed) {
        if (actions.every(action => !state[action])) armed = true;
        frame = requestAnimationFrame(poll);
        return;
      }
      actions.forEach(action => {
        const held = state[action];
        if (held && !previous[action]) {
          handleAction(action, "press");
          repeats[action] = now + 360;
        } else if (held && previous[action] && ["up", "down", "left", "right"].includes(action) && now >= (repeats[action] ?? Infinity)) {
          handleAction(action, "repeat");
          repeats[action] = now + 115;
        } else if (!held && previous[action]) {
          handleAction(action, "release");
          delete repeats[action];
        }
        previous[action] = held;
      });
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [finishBindingCapture, handleAction]);

  useEffect(() => {
    const open = () => {
      setSettingsOpen(true);
      setAnnouncement("手柄设置已打开");
      window.requestAnimationFrame(() => choose(focusTargets()[0] ?? null));
    };
    window.addEventListener(GLOBAL_GAMEPAD_SETTINGS_EVENT, open);
    return () => window.removeEventListener(GLOBAL_GAMEPAD_SETTINGS_EVENT, open);
  }, [choose]);

  useEffect(() => {
    const update = () => syncOverlay();
    const abandon = (event: PointerEvent | KeyboardEvent) => {
      if (!event.isTrusted) return;
      if (event instanceof KeyboardEvent && event.key === "Tab") return;
      active.current?.removeAttribute("data-gamepad-focus");
      active.current = null;
      setMode("navigation");
      setOverlay(null);
      setLabel("");
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("pointerdown", abandon, true);
    window.addEventListener("keydown", abandon, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("pointerdown", abandon, true);
      window.removeEventListener("keydown", abandon, true);
      active.current?.removeAttribute("data-gamepad-focus");
    };
  }, [setMode, syncOverlay]);

  useEffect(() => {
    const timer = window.setInterval(syncOverlay, 250);
    return () => window.clearInterval(timer);
  }, [syncOverlay]);

  return <>
    {children}
    {overlay && <div
      className={`gamepad-cursor gamepad-cursor--${overlay.kind}`}
      style={{ left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height }}
      aria-hidden="true"
    />}
    {connected && label && <div className={`gamepad-status gamepad-status--${modeView}`} role="status">
      <span aria-hidden="true">◉</span>
      <strong>{label.slice(0, 42)}</strong>
      <small>{modeView === "navigation" ? "方向键移动 · A 确认 · RB 换栏目 · B 返回" : modeView === "adjust" ? "方向键调节 · B 完成编辑" : "操控中 · A 主动作 · B 完成退出"}</small>
    </div>}
    <span className="gamepad-live" aria-live="polite">{announcement}</span>
    {numeric && <section className="gamepad-number-pad" role="dialog" aria-modal="true" aria-labelledby="gamepad-number-title">
      <header><div><small>手柄数字输入</small><h2 id="gamepad-number-title">输入数字</h2></div><strong>{numeric.draft || "_"}</strong></header>
      <div className="gamepad-number-grid">
        {NUMERIC_KEYS.map((key, index) => <button
          key={key.label}
          type="button"
          className={`${index === numericIndex ? "is-selected" : ""} ${"action" in key && key.action === "done" ? "is-done" : ""}`}
          aria-pressed={index === numericIndex}
          onClick={() => { numericIndexRef.current = index; setNumericIndex(index); activateNumericKey(); }}
        >{key.label}</button>)}
      </div>
      <p>B 取消 · X 退格 · A 输入</p>
    </section>}
    {settingsOpen && <section className="gamepad-settings-panel" role="dialog" aria-modal="true" aria-labelledby="gamepad-settings-title">
      <header><div><small>浏览器本地设置</small><h2 id="gamepad-settings-title">全站手柄键位</h2></div><button type="button" onClick={() => { captureRef.current = null; setCaptureBinding(null); setSettingsOpen(false); }}>关闭</button></header>
      <p>手柄接入后立即可用，不需要选择操作模式或 USB 设备；两个手柄都可以操作。移动固定支持左摇杆与十字键，不需要绑定。</p>
      <div className="gamepad-binding-list">
        {(Object.keys(BINDING_LABELS) as BindingAction[]).map(action => <div key={action}>
          <span><strong>{BINDING_LABELS[action]}</strong><small>{action === "fullscreenExit" && bindings.fullscreenExit === bindings.fullscreenEnter ? "当前与进入全屏共用" : "点击后按下任意手柄按键"}</small></span>
          <button type="button" className={captureBinding === action ? "is-capturing" : ""} onClick={() => beginBindingCapture(action)}>{captureBinding === action ? "请松开，再按新键…" : BUTTON_NAMES[bindings[action]] ?? `按钮 ${bindings[action] + 1}`}</button>
        </div>)}
      </div>
      <div className="gamepad-settings-actions"><button type="button" onClick={() => saveBindings({ ...DEFAULT_GLOBAL_GAMEPAD_BINDINGS })}>恢复默认键位</button><button type="button" className="is-primary" onClick={() => { captureRef.current = null; setCaptureBinding(null); setSettingsOpen(false); }}>完成设置</button></div>
      <p className="gamepad-settings-note">默认：A 确认并进入编辑，B 完成编辑并返回，RB / R1 切换栏目，按下左摇杆切换全屏。等待新按键 10 秒后会自动取消，不会卡住。</p>
    </section>}
  </>;
}
