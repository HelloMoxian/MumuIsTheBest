import type { Special } from "../../../../server/src/bejeweled-engine";
import "./special-gem-aura.css";

/** Local vector light, carried by the gem's existing swap/fall transform. */
export function SpecialGemAura({ special }: { special: Exclude<Special, "normal"> }) {
  return <span className={"bj-aura bj-aura--" + special} aria-hidden="true">
    {special === "flame" && <>
      <span className="bj-aura-heat" />
      <svg className="bj-aura-front bj-aura-flame-shell" viewBox="0 0 100 100" focusable="false">
        <path className="bj-aura-fire bj-aura-fire--left" d="M27 89C5 79 8 56 20 43C18 57 29 57 27 38C42 56 43 76 27 89Z" />
        <path className="bj-aura-fire bj-aura-fire--crown" d="M40 44C25 35 37 15 48 3C44 20 63 22 57 7C78 27 75 40 62 47C67 33 54 30 53 21C45 32 38 37 40 44Z" />
        <path className="bj-aura-fire bj-aura-fire--right" d="M69 90C59 72 66 61 76 47C74 62 87 57 83 35C103 60 97 84 69 90Z" />
        <path className="bj-aura-fire-bright bj-aura-fire--left" d="M24 84C12 73 17 64 20 56C21 69 30 65 29 75Z" />
        <path className="bj-aura-fire-bright bj-aura-fire--crown" d="M48 44C39 33 46 20 49 15C48 28 59 26 56 36Z" />
        <path className="bj-aura-fire-bright bj-aura-fire--right" d="M76 83C68 76 77 66 80 58C82 70 88 72 76 83Z" />
        <path className="bj-aura-fire-core" d="M28 83Q47 100 73 82Q62 98 49 98Q36 98 28 83Z" />
      </svg>
      <svg className="bj-aura-front" viewBox="0 0 100 100" focusable="false">
        <circle className="bj-aura-ember" cx="16" cy="75" r="3" />
        <circle className="bj-aura-ember bj-aura-ember--two" cx="80" cy="66" r="2.8" />
        <circle className="bj-aura-ember bj-aura-ember--three" cx="54" cy="37" r="2.4" />
        <circle className="bj-aura-ember bj-aura-ember--four" cx="29" cy="53" r="2.2" />
        <circle className="bj-aura-ember bj-aura-ember--five" cx="88" cy="80" r="2.5" />
        <circle className="bj-aura-ember bj-aura-ember--six" cx="67" cy="48" r="1.9" />
      </svg>
    </>}
    {special === "star" && <svg className="bj-aura-front" viewBox="0 0 100 100" focusable="false">
      <g className="bj-aura-star-rays">
        <path className="bj-aura-ray-halo" d="M50 2L56 40L98 50L56 57L50 98L43 57L2 50L43 42Z" />
        <path className="bj-aura-ray-core" d="M50 4L52 44L95 50L53 53L50 96L47 54L5 50L47 47Z" />
      </g>
      <g className="bj-aura-orbit"><circle className="bj-aura-track" cx="50" cy="50" r="40" />
        <path className="bj-aura-spark" d="M50 4L52 8L57 10L52 12L50 17L48 12L43 10L48 8Z" />
        <circle className="bj-aura-spark" cx="50" cy="90" r="2" />
      </g>
    </svg>}
    {special === "cube" && <>
      <span className="bj-aura-spectrum" />
      <svg className="bj-aura-front" viewBox="0 0 100 100" focusable="false">
        <circle className="bj-aura-rainbow-rim" cx="50" cy="50" r="42" />
        <g className="bj-aura-orbit"><path className="bj-aura-spark" d="M50 1L53 7L60 10L53 13L50 19L47 13L40 10L47 7Z" />
          <circle className="bj-aura-spark" cx="50" cy="90" r="2.5" />
          <circle className="bj-aura-spark" cx="10" cy="50" r="1.7" />
        </g>
      </svg>
    </>}
    {special === "nova" && <svg className="bj-aura-front" viewBox="0 0 100 100" focusable="false">
      <g className="bj-aura-nova-orbits">
        <ellipse className="bj-aura-nova-ring" cx="50" cy="50" rx="47" ry="24" transform="rotate(-35 50 50)" />
        <ellipse className="bj-aura-nova-ring bj-aura-nova-ring--second" cx="50" cy="50" rx="47" ry="24" transform="rotate(35 50 50)" />
        <circle className="bj-aura-spark" cx="12" cy="76" r="2.6" />
        <circle className="bj-aura-spark" cx="88" cy="24" r="2" />
      </g>
      <path className="bj-aura-nova-core" d="M50 5L56 35L78 22L65 44L95 50L65 56L78 78L56 65L50 95L44 65L22 78L35 56L5 50L35 44L22 22L44 35Z" />
    </svg>}
  </span>;
}
