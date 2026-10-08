import { memo, useState, type CSSProperties } from "react";
import type { Config } from "./logic";
export const SKIN_NAMES: Record<Config["skin"], string> = { gems: "宝石迷阵", elements: "原子星港", crystal: "水晶积木", voxel: "像素矿块", aurora: "极光星珀" };
export const SYMBOLS = ["◆", "●", "▲", "✦", "■", "⬡", "♥"];
const COLORS = ["--rose-400", "--cyan-300", "--green-400", "--warning-300", "--violet-400", "--pink-400", "--ink-primary"];
const FILES = ["red", "blue", "green", "yellow", "purple", "orange", "white"];
const ELEMENTS = ["H", "He", "Li", "Be", "B", "C", "N"];
const BLOCKS = ["Z", "I", "S", "O", "T", "L", "J"];
const SHAPES = [
  "M32 5 57 32 32 59 7 32Z",
  "M32 5A27 27 0 1 1 31.99 5Z",
  "M32 5 60 55 4 55Z",
  "M32 3 40 22 61 24 45 38 50 59 32 48 14 59 19 38 3 24 24 22Z",
  "M14 7H50L57 14V50L50 57H14L7 50V14Z",
  "M18 6H46L60 32 46 58H18L4 32Z",
  "M32 57 7 32C-3 7 23 1 32 19 41 1 67 7 57 32Z",
];
export const Gem = memo(function Gem({ kind, skin }: { kind: number; skin: Config["skin"] }) {
  const [broken, setBroken] = useState("");
  const style = { "--gem-color": `var(${COLORS[kind]})` } as CSSProperties;
  const src = skin === "gems" ? `/images/bejeweled/${FILES[kind]}.webp` : skin === "elements" ? `/images/diamond-blocks/elements-v1/${ELEMENTS[kind].toLowerCase()}.png` : "";
  if (src) return <span className="db-gem db-gem--image" style={style} aria-hidden="true">{broken === src ? <b>{skin === "elements" ? ELEMENTS[kind] : SYMBOLS[kind]}</b> : <img src={src} alt="" draggable={false} onError={() => setBroken(src)} />}</span>;
  if (skin === "crystal") return <span aria-hidden="true" style={style} className={`db-gem db-crystal tetris-crystal crystal-${BLOCKS[kind]}`}><b>{SYMBOLS[kind]}</b></span>;
  if (skin === "voxel") return <span className="db-gem db-voxel" style={style} aria-hidden="true"><svg viewBox="0 0 64 64">
    <path className="db-voxel__top" d="M4 16 32 3 60 16 32 30Z" /><path className="db-voxel__left" d="M4 16 32 30V61L4 47Z" /><path className="db-voxel__right" d="M32 30 60 16V47L32 61Z" />
    <path className="db-voxel__pixels" d={["M9 28h8v8H9z M18 41h7v9h-7z M39 39h9v8h-9z", "M8 23h17v5H8z M8 33h17v5H8z M9 43h16v5H9z", "M9 25h7v7H9z M16 32h7v7h-7z M9 39h7v7H9z", "M13 26h8v20h-8z M8 32h18v8H8z", "M9 26h15v17H9z M38 34h14v13H38z", "M9 25h6v6H9z M19 36h6v6h-6z M10 43h6v6h-6z", "M8 26h18v6H8z M8 39h18v6H8z M39 32h15v6H39z"][kind]} />
    <path d="M4 16 32 30 60 16M32 30V61" fill="none" stroke="var(--space-950)" strokeWidth="2" />
  </svg></span>;
  return <span className="db-gem db-aurora" style={style} aria-hidden="true"><svg viewBox="0 0 64 64">
    <path d={SHAPES[kind]} className="db-aurora__body" />
    <path d={SHAPES[kind]} className="db-aurora__core" transform="translate(12 12) scale(.625)" />
    <path d="M17 22Q25 10 39 16M18 26l-2 4" className="db-aurora__glint" />
    <path d="m42 35 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" className="db-aurora__star" />
  </svg></span>;
});
