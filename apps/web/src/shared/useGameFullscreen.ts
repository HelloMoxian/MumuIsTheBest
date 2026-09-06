import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Native fullscreen where available, with an equivalent window-filling fallback. */
export function useGameFullscreen(target: RefObject<HTMLElement | null>) {
  const [focused, setFocused] = useState(false);
  const [switching, setSwitching] = useState(false);
  const native = useRef(false), busy = useRef(false), mounted = useRef(true);
  const previousFocus = useRef<HTMLElement | null>(null);
  const leave = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setSwitching(true);
    try {
      if (document.fullscreenElement === target.current) await document.exitFullscreen();
      setFocused(false);
    } catch {
      // Keep the exit control available if the browser is still in native fullscreen.
      if (document.fullscreenElement !== target.current) setFocused(false);
    } finally { busy.current = false; if (mounted.current) setSwitching(false); }
  }, [target]);
  const enter = useCallback(async () => {
    if (busy.current || !target.current) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    busy.current = true; setSwitching(true); setFocused(true);
    try {
      if (target.current.requestFullscreen) await target.current.requestFullscreen();
    } catch { /* A rejected fullscreen request still gives a complete window-filling board. */ }
    finally { busy.current = false; if (mounted.current) setSwitching(false); }
  }, [target]);
  useEffect(() => {
    mounted.current = true;
    const changed = () => {
      if (document.fullscreenElement === target.current) {
        native.current = true; setFocused(true);
      } else if (native.current) {
        native.current = false; setFocused(false);
      }
    };
    document.addEventListener("fullscreenchange", changed);
    return () => {
      mounted.current = false;
      document.removeEventListener("fullscreenchange", changed);
    };
  }, [target]);
  useEffect(() => {
    if (!focused) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const scope = target.current;
    scope?.querySelector<HTMLElement>("[data-fullscreen-exit]")?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        event.preventDefault(); void leave();
      }
      if (event.key === "Tab" && scope) {
        const controls = [...scope.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
          .filter(element => element.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (!first || !last) return;
        const active = document.activeElement;
        if (event.shiftKey ? active === first || !scope.contains(active) : active === last || !scope.contains(active)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = prior;
      document.removeEventListener("keydown", escape);
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    };
  }, [focused, leave, target]);
  useEffect(() => {
    if (!focused || switching) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !target.current?.contains(active) || active.getClientRects().length === 0) {
      target.current?.querySelector<HTMLElement>("[data-fullscreen-exit]")?.focus({ preventScroll: true });
    }
  }, [focused, switching, target]);
  return { focused, switching, enter, leave };
}
