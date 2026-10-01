import { MATERIALS } from "./model";
// Material palette is intentionally distinct from UI status colors.
const palette = {
  wood: ["#dfb477", "#87512c"],
  stone: ["#b2b6bb", "#626973"],
  metal: ["#f4f7fc", "#798797"],
};
export function MaterialTextures() {
  return (
    <>
      {Object.entries(MATERIALS).map(([id, m]) => {
        const family =
          m.presetGroup === "legacy"
            ? id.includes("wood")
              ? "wood"
              : ["metal", "steel_235", "steel_355"].includes(id)
                ? "metal"
                : id === "elastic"
                  ? "elastic"
                  : "stone"
            : m.presetGroup;
        if (family === "elastic" || family === "cushion")
          return (
            <linearGradient key={id} id={"house-" + id} x2=".7" y2="1">
              <stop stopColor={`var(${m.token})`} />
              <stop
                offset="1"
                stopColor={`var(${m.token})`}
                stopOpacity=".45"
              />
            </linearGradient>
          );
        const colors = palette[family as keyof typeof palette] ?? palette.stone;
        return (
          <g key={id}>
            <linearGradient id={"house-" + id} x2=".3" y2="1">
              <stop stopColor={colors[1]} />
              <stop offset=".28" stopColor={colors[0]} />
              <stop
                offset=".42"
                stopColor={family === "metal" ? "#ffffff" : colors[0]}
              />
              <stop offset="1" stopColor={colors[1]} />
            </linearGradient>
            <pattern
              id={"grain-" + id}
              width="120"
              height="80"
              patternUnits="userSpaceOnUse"
            >
              {family === "wood" ? (
                <g fill="none" stroke={colors[1]} opacity=".5" strokeWidth="1">
                  <path d="M-5 8Q30 1 65 10T125 7M-5 23Q20 35 60 23T125 24M-5 48Q30 36 62 47T125 48M-5 65Q25 77 65 66T125 65" />
                  <ellipse cx="35" cy="47" rx="17" ry="5" />
                  <ellipse cx="35" cy="47" rx="7" ry="2" />
                </g>
              ) : family === "stone" ? (
                <g stroke={colors[1]} strokeWidth=".8" opacity=".45">
                  <path
                    d="M0 22L24 8 52 17 39 39 12 44ZM65 0L59 28 86 42 120 23M0 64L34 55 58 80M79 80L72 59 103 50 120 64"
                    fill="none"
                  />
                  <path
                    d="M14 48L39 43 52 58 34 66ZM80 6L103 13 92 25 72 22Z"
                    fill={colors[0]}
                    stroke="none"
                  />
                </g>
              ) : (
                <g stroke={colors[0]} opacity=".26" strokeWidth=".5">
                  {Array.from({ length: 20 }, (_, i) => (
                    <path key={i} d={`M0 ${i * 4}h120`} />
                  ))}
                </g>
              )}
            </pattern>
          </g>
        );
      })}
    </>
  );
}
