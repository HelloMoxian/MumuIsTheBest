import type { Game } from './model';

export type Defeat = { sprite: string; x: number; y: number; width: number; height: number; direction: number; age: number };
type Feedback = { scores: { x: number; y: number; amount: number; age: number }[]; defeats: Defeat[]; boost: number; stride: number };
// Presentation only: saves keep the committed score and defeated objects, never replay effects.
const feedback = new WeakMap<Game, Feedback>();
export function effectsFor(g: Game): Feedback {
  let current = feedback.get(g);
  if (!current) { current = { scores: [], defeats: [], boost: 0, stride: 0 }; feedback.set(g, current); }
  return current;
}
export function resetEffects(g: Game) { feedback.delete(g); }
export function advanceEffects(g: Game, dt: number) {
  const fx = effectsFor(g);
  fx.boost = Math.max(0, fx.boost - dt);
  for (const score of fx.scores) score.age += dt;
  for (const defeat of fx.defeats) defeat.age += dt;
  fx.scores = fx.scores.filter(score => score.age < 1.05);
  fx.defeats = fx.defeats.filter(defeat => defeat.age < 1.3);
}
export function showScore(g: Game, x: number, y: number, amount: number) {
  const fx = effectsFor(g); fx.scores.push({ x, y, amount, age: 0 });
  if (fx.scores.length > 24) fx.scores.shift();
}
export function showDefeat(g: Game, sprite: string, x: number, y: number, width: number, height: number, direction: number) {
  const fx = effectsFor(g); fx.defeats.push({ sprite, x, y: y - height / 2, width, height, direction: direction < 0 ? -1 : 1, age: 0 });
  if (fx.defeats.length > 32) fx.defeats.shift();
}
export const rockId = (index: number) => `rock:${index}`;
