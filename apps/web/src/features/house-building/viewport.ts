export function zoomView(
  view: { x: number; y: number; span: number },
  anchor: { x: number; y: number },
  delta: number,
) {
  const span = Math.max(
    6,
    Math.min(
      84,
      view.span * Math.exp(Math.max(-300, Math.min(300, delta)) * 0.0015),
    ),
  );
  const ratio = span / view.span;
  return {
    span,
    x: Math.max(-40, Math.min(40, anchor.x + (view.x - anchor.x) * ratio)),
    y: Math.max(-2, Math.min(40, anchor.y + (view.y - anchor.y) * ratio)),
  };
}
