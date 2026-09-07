import { createContext, useContext } from "react";

export const GlobalMusicPanelContext = createContext<(() => void) | null>(null);

/** Immersive pages can place the shared music controls inside their own settings. */
export function useGlobalMusicPanel() {
  return useContext(GlobalMusicPanelContext);
}
