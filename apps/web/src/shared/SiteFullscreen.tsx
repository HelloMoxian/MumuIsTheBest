import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "mumu.site-fullscreen.v1";
const SITE_FULLSCREEN_REQUEST_EVENT = "mumu:site-fullscreen-request";

type SiteFullscreenState = {
  active: boolean;
  switching: boolean;
  toggle: () => Promise<void>;
};

const SiteFullscreenContext = createContext<SiteFullscreenState | null>(null);

function readSavedState() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function SiteFullscreenProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(readSavedState);
  const [switching, setSwitching] = useState(false);
  const previousFullscreen = useRef<Element | null>(document.fullscreenElement);

  const saveActive = useCallback((next: boolean) => {
    setActive(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // The mode still works for this page when storage is unavailable.
    }
  }, []);

  const toggle = useCallback(async () => {
    if (switching) return;
    setSwitching(true);
    try {
      if (active) {
        saveActive(false);
        if (document.fullscreenElement) await document.exitFullscreen();
      } else {
        saveActive(true);
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      }
    } catch {
      // Keep the window-filling site mode when native fullscreen is rejected.
    } finally {
      setSwitching(false);
    }
  }, [active, saveActive, switching]);

  useEffect(() => {
    document.body.toggleAttribute("data-site-fullscreen", active);
    document.documentElement.toggleAttribute("data-site-fullscreen", active);
    return () => {
      document.body.removeAttribute("data-site-fullscreen");
      document.documentElement.removeAttribute("data-site-fullscreen");
    };
  }, [active]);

  useEffect(() => {
    const requested = (event: Event) => {
      const desired = (event as CustomEvent<{ active?: boolean }>).detail?.active;
      if (typeof desired === "boolean" && desired === active) return;
      void toggle();
    };
    window.addEventListener(SITE_FULLSCREEN_REQUEST_EVENT, requested);
    return () => window.removeEventListener(SITE_FULLSCREEN_REQUEST_EVENT, requested);
  }, [active, toggle]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const current = document.fullscreenElement;
      if (active && previousFullscreen.current === document.documentElement && current === null) {
        saveActive(false);
      }
      previousFullscreen.current = current;
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [active, saveActive]);

  useEffect(() => {
    if (!active) return;
    const stopContextMenu = (event: MouseEvent) => event.preventDefault();
    const stopDrag = (event: DragEvent) => event.preventDefault();
    const stopSelection = (event: Event) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    document.addEventListener("contextmenu", stopContextMenu);
    document.addEventListener("dragstart", stopDrag);
    document.addEventListener("selectstart", stopSelection);
    return () => {
      document.removeEventListener("contextmenu", stopContextMenu);
      document.removeEventListener("dragstart", stopDrag);
      document.removeEventListener("selectstart", stopSelection);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const keepFullscreenNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target || anchor.download) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname.endsWith(".html")) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      window.history.pushState({}, "", destination.href);
      window.scrollTo({ top: 0, left: 0 });
      window.dispatchEvent(new PopStateEvent("popstate"));
    };
    document.addEventListener("click", keepFullscreenNavigation, true);
    return () => document.removeEventListener("click", keepFullscreenNavigation, true);
  }, [active]);

  return (
    <SiteFullscreenContext.Provider value={{ active, switching, toggle }}>
      {children}
      {active && (
        <button
          className="site-fullscreen-floating"
          type="button"
          disabled={switching}
          onClick={() => void toggle()}
          aria-label="退出站点全屏模式"
        >
          退出站点全屏
        </button>
      )}
    </SiteFullscreenContext.Provider>
  );
}

export function SiteFullscreenButton({ className = "" }: { className?: string }) {
  const fullscreen = useContext(SiteFullscreenContext);
  if (!fullscreen) return null;
  return (
    <button
      className={`site-fullscreen-button ${className}`.trim()}
      type="button"
      disabled={fullscreen.switching}
      aria-pressed={fullscreen.active}
      onClick={() => void fullscreen.toggle()}
    >
      {fullscreen.switching ? "切换中…" : fullscreen.active ? "退出全屏" : "全屏模式"}
    </button>
  );
}
