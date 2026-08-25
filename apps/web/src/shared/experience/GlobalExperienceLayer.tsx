import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  getExperienceSnapshot,
  hydrateExperiencePreferences,
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

function nextMode<T extends string>(
  options: readonly { value: T; short: string }[],
  current: T,
) {
  const currentIndex = options.findIndex((option) => option.value === current);
  return options[(currentIndex + 1) % options.length]?.value ?? options[0]!.value;
}

export function CompactExperienceControls() {
  const { interfaceMode, readAloudMode } = useExperiencePreferences();
  const interfaceOption = INTERFACE_OPTIONS.find((option) => option.value === interfaceMode)
    ?? INTERFACE_OPTIONS[0];
  const readOption = READ_OPTIONS.find((option) => option.value === readAloudMode)
    ?? READ_OPTIONS[0];

  return (
    <div className="global-compact-experience" data-no-ui-translation>
      <button
        type="button"
        aria-label={`界面语言当前为${interfaceOption.short}，点击切换`}
        onClick={() => setInterfaceMode(nextMode(INTERFACE_OPTIONS, interfaceMode))}
      >
        {interfaceOption.short}
      </button>
      <button
        type="button"
        aria-label={`朗读语言当前为${readOption.short}，点击切换`}
        onClick={() => {
          stopLearningSpeech();
          setReadAloudMode(nextMode(READ_OPTIONS, readAloudMode));
        }}
      >
        {readOption.short}
      </button>
    </div>
  );
}

export function GlobalExperienceLayer({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const localizerRef = useRef<DomLocalizer | null>(null);
  const { interfaceMode } = useExperiencePreferences();

  useEffect(() => {
    void hydrateExperiencePreferences();
  }, []);

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
      if (!action || action.closest(".global-compact-experience") || action.closest("[data-skip-startup-greeting]")) return;
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
      <div className="global-experience-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
