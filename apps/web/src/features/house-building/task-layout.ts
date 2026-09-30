import type { HouseChallenge } from "./challenge";
import type { Point } from "./model";
export function moveTaskGoal(
  c: HouseChallenge,
  goal: string,
  point: Point,
): HouseChallenge {
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(v * 10) / 10));
  const next: HouseChallenge = {
    ...c,
    layoutVersion: c.layoutVersion ?? 2,
    ...(c.zones ? { zones: c.zones.map((z) => ({ ...z })) } : {}),
    target: { ...c.target },
    regions: c.regions.map((r) => ({ ...r })),
  };
  if (goal === "height") next.height = clamp(point.y, 0.5, 40);
  else if (goal === "target")
    next.target = { x: clamp(point.x, -40, 40), y: clamp(point.y, 0.1, 40) };
  else if (goal.startsWith("zone:")) {
    const z = next.zones?.find((z) => z.id === goal.slice(5));
    if (!z) return c;
    const w = z.right - z.left,
      h = z.top - z.bottom;
    z.left = clamp(point.x - w / 2, -40, 40 - w);
    z.right = z.left + w;
    z.bottom = clamp(point.y - h / 2, 0, 40 - h);
    z.top = z.bottom + h;
  } else if (goal.startsWith("foundation:")) {
    const i = Number(goal.split(":")[1]),
      r = next.regions[i];
    if (!r) return c;
    const width = r.right - r.left;
    const min = i ? next.regions[i - 1].right + 0.2 : -40;
    const max =
      i + 1 < next.regions.length ? next.regions[i + 1].left - 0.2 : 40;
    r.left = clamp(point.x - width / 2, min, max - width);
    r.right = r.left + width;
  }
  return next;
}

export function taskCamera(c: HouseChallenge) {
  const xs = [
    0,
    ...(c.zones ?? [])
      .filter((z) => z.enabled)
      .flatMap((z) => [z.left, z.right]),
    ...(c.flags.target ? [c.target.x] : []),
    ...(c.flags.foundation ? c.regions.flatMap((r) => [r.left, r.right]) : []),
  ];
  const top = Math.max(
    4,
    ...(c.zones ?? []).filter((z) => z.enabled).map((z) => z.top),
    c.flags.height ? c.height : 0,
    c.flags.target ? c.target.y : 0,
  );
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: top / 2 + 1,
    span: Math.min(
      84,
      Math.max(20, Math.max(...xs) - Math.min(...xs) + 6, (top + 4) / 0.6),
    ),
  };
}

export type TaskDrawKind = "required" | "forbidden" | "foundation";
export function addTaskArea(
  c: HouseChallenge,
  kind: TaskDrawKind,
  a: Point,
  b: Point,
  id: string,
): HouseChallenge {
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));
  const left = clamp(Math.min(a.x, b.x), -40, 39.5),
    right = clamp(Math.max(left + 0.5, a.x, b.x), left + 0.5, 40);
  const next: HouseChallenge = {
    ...c,
    layoutVersion: 3,
    zones: c.zones?.map((z) => ({ ...z })) ?? [],
    flags: { ...c.flags },
  };
  if (kind === "foundation") {
    const regions = c.flags.foundation ? c.regions : [];
    if (
      regions.length >= 12 ||
      regions.some((r) => left < r.right + 0.1 && right > r.left - 0.1)
    )
      return c;
    next.regions = [...regions, { left, right }].sort(
      (a, b) => a.left - b.left,
    );
    next.flags.foundation = true;
  } else {
    if (next.zones!.length >= 24) return c;
    const bottom = clamp(Math.min(a.y, b.y), 0, 39.5),
      top = clamp(Math.max(bottom + 0.5, a.y, b.y), bottom + 0.5, 40);
    next.zones!.push({ id, kind, left, right, bottom, top, enabled: true });
  }
  return next;
}
