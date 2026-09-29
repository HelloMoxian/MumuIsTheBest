import type { ReactNode } from "react";
import "./experiment-workbench.css";

/** Shared single-stage editor / experiment layout; feature owns its scientific model. */
export function ExperimentWorkbench({
  toolbar,
  stage,
  sidebar,
  status,
}: {
  toolbar: ReactNode;
  stage: ReactNode;
  sidebar: ReactNode;
  status: ReactNode;
}) {
  return (
    <main className="experiment-workbench">
      <div className="experiment-workbench__toolbar">{toolbar}</div>
      <div className="experiment-workbench__grid">
        <section
          className="experiment-workbench__stage"
          aria-label="实验工作区"
        >
          {stage}
        </section>
        <aside
          className="experiment-workbench__sidebar"
          aria-label="搭建和实验工具"
        >
          {sidebar}
        </aside>
      </div>
      <div className="experiment-workbench__status" role="status">
        {status}
      </div>
    </main>
  );
}
