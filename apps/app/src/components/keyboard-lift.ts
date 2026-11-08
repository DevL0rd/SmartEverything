export interface VerticalFrame {
  readonly pageY: number;
  readonly height: number;
}

export function keyboardLift(
  keyboard: number,
  view: VerticalFrame | null,
  root: VerticalFrame | null,
): number {
  'worklet';
  if (view === null || root === null) {
    return 0;
  }
  const below = root.pageY + root.height - (view.pageY + view.height);
  return Math.max(0, keyboard - Math.max(0, below));
}
