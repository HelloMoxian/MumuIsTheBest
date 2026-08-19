import type { ReactNode } from "react";
import { useExperiencePreferences } from "./experience-store";

export function LocalizedLines({
  zh,
  en,
}: {
  zh: ReactNode;
  en: ReactNode;
}) {
  const { interfaceMode } = useExperiencePreferences();
  return (
    <>
      {interfaceMode !== "en" && <span className="localized-copy-line lang-zh">{zh}</span>}
      {interfaceMode !== "zh" && <span className="localized-copy-line lang-en">{en}</span>}
    </>
  );
}
