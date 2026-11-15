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

export interface LiftReport {
  readonly keyboard: number;
  readonly lift: number;
  readonly viewTop: number | null;
  readonly viewBottom: number | null;
  readonly rootBottom: number | null;
  readonly covered: number | null;
}

export function liftReport(
  keyboard: number,
  view: VerticalFrame | null,
  root: VerticalFrame | null,
  lift: number,
): LiftReport {
  'worklet';
  const viewBottom = view === null ? null : view.pageY + view.height;
  const rootBottom = root === null ? null : root.pageY + root.height;
  return {
    keyboard: Math.round(keyboard),
    lift: Math.round(lift),
    viewTop: view === null ? null : Math.round(view.pageY),
    viewBottom: viewBottom === null ? null : Math.round(viewBottom),
    rootBottom: rootBottom === null ? null : Math.round(rootBottom),
    covered:
      viewBottom === null || rootBottom === null
        ? null
        : Math.max(0, Math.round(viewBottom - lift - (rootBottom - keyboard))),
  };
}
