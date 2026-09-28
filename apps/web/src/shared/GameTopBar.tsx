import type { MouseEventHandler, ReactNode } from "react";
import { EnergyCoinBalancePill } from "./EnergyCoinBalancePill";
import { LearningCoinBalancePill } from "./LearningCoinLayer";
import "./game-topbar.css";

type GameTopBarProps = {
  title: string;
  backHref?: string;
  backLabel?: string;
  onBack?: MouseEventHandler<HTMLAnchorElement>;
  backDisabled?: boolean;
  controls?: ReactNode;
  wallets?: ReactNode | false;
  className?: string;
};

export function GameTopBar({
  title,
  backHref = "/?tab=games",
  backLabel = "游戏大厅",
  onBack,
  backDisabled = false,
  controls,
  wallets,
  className = "",
}: GameTopBarProps) {
  return (
    <header className={`game-topbar ${className}`.trim()}>
      <a className="game-topbar__back" href={backHref} aria-label={`返回${backLabel}`} aria-disabled={backDisabled || undefined} onClick={event => { if (backDisabled) event.preventDefault(); else onBack?.(event); }}>
        <span aria-hidden="true">←</span><span>{backLabel}</span>
      </a>
      <strong className="game-topbar__title">{title}</strong>
      {controls && <div className="game-topbar__controls">{controls}</div>}
      {wallets !== false && (
        <div className="game-topbar__wallets">
          {wallets ?? <><LearningCoinBalancePill /><EnergyCoinBalancePill /></>}
        </div>
      )}
    </header>
  );
}
