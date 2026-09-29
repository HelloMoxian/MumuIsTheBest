import type { SimulationSnapshot } from "./engine";
import type { Point } from "./model";
type Piece = SimulationSnapshot["pieces"][number];

/** Join only segments still connected in the solver; never hide a fracture. */
export function renderPieces(pieces: Piece[]): Piece[] {
  const chains: Piece[][] = [],
    byKey = new Map<string, Piece[]>();
  for (const piece of pieces) {
    const chain = piece.beamPrevious
      ? byKey.get(piece.beamPrevious)
      : undefined;
    if (chain) chain.push(piece);
    else chains.push([piece]);
    byKey.set(piece.key, chain ?? chains[chains.length - 1]);
  }
  return chains.map((chain) => {
    if (chain.length === 1) return chain[0];
    const first = chain[0];
    const mass = chain.reduce((n, p) => n + p.mass, 0);
    const origin = {
      x: chain.reduce((n, p) => n + p.x * p.mass, 0) / mass,
      y: chain.reduce((n, p) => n + p.y * p.mass, 0) / mass,
    };
    const corner = (p: Piece, x: number, y: number): Point => ({
      x: p.x + x * Math.cos(p.angle) - y * Math.sin(p.angle) - origin.x,
      y: p.y + x * Math.sin(p.angle) + y * Math.cos(p.angle) - origin.y,
    });
    const edge = (sign: number) => {
      const points = [
        corner(first, -first.width / 2, (sign * first.height) / 2),
      ];
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1],
          b = chain[i];
        const left = corner(a, a.width / 2, (sign * a.height) / 2);
        const right = corner(b, -b.width / 2, (sign * b.height) / 2);
        points.push({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 });
      }
      const last = chain[chain.length - 1];
      points.push(corner(last, last.width / 2, (sign * last.height) / 2));
      return points;
    };
    return {
      ...first,
      ...origin,
      angle: 0,
      vertices: [...edge(1), ...edge(-1).reverse()],
      width: chain.reduce((n, p) => n + p.width, 0),
      mass: chain.reduce((n, p) => n + p.mass, 0),
      damaged: chain.some((p) => p.damaged),
      utilization: Math.max(...chain.map((p) => p.utilization)),
      supported: chain.some((p) => p.supported),
    };
  });
}
