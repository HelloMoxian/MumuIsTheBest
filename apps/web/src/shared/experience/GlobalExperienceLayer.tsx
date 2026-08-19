import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { browserTts } from "../speech";
import {
  getExperienceSnapshot,
  setInterfaceMode,
  setReadAloudMode,
  useExperiencePreferences,
  type ReadAloudMode,
} from "./experience-store";
import {
  STARTUP_GREETINGS,
  speakLearningMoment,
  stopLearningSpeech,
} from "./learning-speech";
import {
  createDomLocalizer,
  type DomLocalizer,
  type InterfaceLanguageMode,
} from "./translations";
import "./global-experience.css";

const GREETING_SESSION_KEY = "mumu:startup-greeting-heard:v1";

const INTERFACE_OPTIONS: readonly { value: InterfaceLanguageMode; short: string }[] = [
  { value: "zh", short: "中" },
  { value: "en", short: "英" },
  { value: "bilingual", short: "中英" },
];
const READ_OPTIONS: readonly { value: ReadAloudMode; short: string }[] = [
  { value: "none", short: "无" },
  { value: "zh", short: "中" },
  { value: "en", short: "英" },
  { value: "bilingual", short: "中英" },
];

function modeLabel(mode: InterfaceLanguageMode, zh: string, en: string) {
  if (mode === "zh") return zh;
  if (mode === "en") return en;
  return `${zh} / ${en}`;
}

function speechStatusLabel(
  interfaceMode: InterfaceLanguageMode,
  status: ReturnType<typeof useExperiencePreferences>["speechStatus"],
) {
  const labels = {
    idle: ["准备朗读", "Ready"],
    "speaking-zh": ["正在读中文", "Reading Chinese"],
    "speaking-en": ["正在读英文", "Reading English"],
    unavailable: ["暂时不能朗读", "Voice unavailable"],
    error: ["朗读需要再试一次", "Try reading again"],
  } as const;
  return modeLabel(interfaceMode, labels[status][0], labels[status][1]);
}

function ExperienceControls() {
  const { interfaceMode, readAloudMode, speechStatus } = useExperiencePreferences();
  const isSpeaking = speechStatus === "speaking-zh" || speechStatus === "speaking-en";

  return (
    <header className="global-experience-bar" data-no-ui-translation>
      <div className="global-experience-title" aria-hidden="true">
        <span>文</span>
        <strong>{modeLabel(interfaceMode, "语言舱", "Language Deck")}</strong>
      </div>

      <fieldset className="global-mode-control">
        <legend>{modeLabel(interfaceMode, "界面", "Interface")}</legend>
        <div className="global-segment" role="group" aria-label="界面语言 Interface language">
          {INTERFACE_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={interfaceMode === option.value ? "is-selected" : ""}
              aria-pressed={interfaceMode === option.value}
              aria-label={option.value === "zh" ? "中文界面" : option.value === "en" ? "English interface" : "中英双语界面 Bilingual interface"}
              onClick={() => setInterfaceMode(option.value)}
            >
              {interfaceMode === option.value && <i aria-hidden="true">✓</i>}
              {option.short}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="global-mode-control global-read-control">
        <legend>{modeLabel(interfaceMode, "朗读", "Read aloud")}</legend>
        <div className="global-segment" role="group" aria-label="朗读语言 Read-aloud language">
          {READ_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={readAloudMode === option.value ? "is-selected" : ""}
              aria-pressed={readAloudMode === option.value}
              aria-label={`朗读模式 ${option.short}`}
              onClick={() => {
                if (option.value === "none") stopLearningSpeech();
                else browserTts.stop();
                setReadAloudMode(option.value);
              }}
            >
              {readAloudMode === option.value && <i aria-hidden="true">✓</i>}
              {option.short}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={`global-speech-status status-${speechStatus}`} aria-live="polite">
        <i aria-hidden="true" />
        <span>{speechStatusLabel(interfaceMode, speechStatus)}</span>
        {isSpeaking && (
          <button type="button" onClick={stopLearningSpeech}>
            {modeLabel(interfaceMode, "停止", "Stop")}
          </button>
        )}
      </div>
    </header>
  );
}

export function GlobalExperienceLayer({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const localizerRef = useRef<DomLocalizer | null>(null);
  const { interfaceMode } = useExperiencePreferences();

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const localizer = createDomLocalizer(content);
    localizerRef.current = localizer;
    localizer.apply(getExperienceSnapshot().interfaceMode);
    return () => {
      localizer.disconnect();
      localizerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    localizerRef.current?.apply(interfaceMode);
    document.documentElement.lang = interfaceMode === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.uiLanguage = interfaceMode;
  }, [interfaceMode]);

  useEffect(() => {
    let heard = false;
    try {
      heard = window.sessionStorage.getItem(GREETING_SESSION_KEY) === "true";
    } catch {
      heard = false;
    }
    if (heard) return;

    const greetAfterFirstAction = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const action = event.target.closest("button, a, input, select, textarea, [role='button']");
      if (!action || action.closest(".global-experience-bar") || action.closest("[data-skip-startup-greeting]")) return;
      const mode = getExperienceSnapshot().readAloudMode;
      if (mode === "none") return;

      try {
        window.sessionStorage.setItem(GREETING_SESSION_KEY, "true");
      } catch {
        // A private browser session may reject storage; greeting still works once in this mount.
      }
      document.removeEventListener("click", greetAfterFirstAction, true);
      const greeting = STARTUP_GREETINGS[Math.floor(Math.random() * STARTUP_GREETINGS.length)];

      const link = action instanceof HTMLAnchorElement ? action : action.closest("a");
      const delayedAction = link instanceof HTMLAnchorElement
        ? link
        : action instanceof HTMLButtonElement || action.getAttribute("role") === "button"
          ? action as HTMLElement
          : action instanceof HTMLInputElement && ["button", "submit", "reset"].includes(action.type)
            ? action
            : null;
      if (delayedAction) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }

      void speakLearningMoment(greeting, "bilingual").finally(() => {
        delayedAction?.click();
      });
    };

    document.addEventListener("click", greetAfterFirstAction, true);
    return () => document.removeEventListener("click", greetAfterFirstAction, true);
  }, []);

  return (
    <div className="global-experience-root">
      <ExperienceControls />
      <div className="global-experience-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
