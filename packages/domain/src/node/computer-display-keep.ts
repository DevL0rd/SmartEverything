import type { DisplayChange, DisplayOutput, DisplayState } from './computer-displays';

export const KEEPABLE_DISPLAY_ACTIONS = ['mode', 'scale', 'position'] as const;

export type KeepableDisplayAction = (typeof KEEPABLE_DISPLAY_ACTIONS)[number];

export type KeepableDisplayChange = Extract<DisplayChange, { action: KeepableDisplayAction }>;

const KEEPABLE: ReadonlySet<string> = new Set(KEEPABLE_DISPLAY_ACTIONS);

const SCALE_TOLERANCE_PERCENT = 1;

const REFRESH_TOLERANCE_HZ = 0.5;

export function displayChangeKeepable(change: DisplayChange): change is KeepableDisplayChange {
  return KEEPABLE.has(change.action);
}

function outputNamed(outputs: readonly DisplayOutput[], reference: string): DisplayOutput | null {
  const wanted = reference.toLowerCase();
  return (
    outputs.find((output) => output.id.toLowerCase() === wanted) ??
    outputs.find((output) => output.name.toLowerCase() === wanted) ??
    null
  );
}

function modeProblem(
  change: Extract<KeepableDisplayChange, { action: 'mode' }>,
  target: DisplayOutput,
): string | null {
  const { mode } = target;
  const sameSize = mode?.width === change.width && mode.height === change.height;
  const sameRefresh =
    change.refreshHz === undefined ||
    (mode !== null && Math.abs(mode.refreshHz - change.refreshHz) <= REFRESH_TOLERANCE_HZ);
  return sameSize && sameRefresh ? null : `${target.name} did not switch to the new mode`;
}

function sideHolds(
  side: Extract<KeepableDisplayChange, { action: 'position' }>['side'],
  target: DisplayOutput,
  anchor: DisplayOutput,
): boolean {
  switch (side) {
    case 'left':
      return target.x < anchor.x;
    case 'right':
      return target.x > anchor.x;
    case 'above':
      return target.y < anchor.y;
    case 'below':
      return target.y > anchor.y;
  }
}

function positionProblem(
  change: Extract<KeepableDisplayChange, { action: 'position' }>,
  target: DisplayOutput,
  outputs: readonly DisplayOutput[],
): string | null {
  const anchor = outputNamed(outputs, change.relativeTo);
  if (anchor === null) return `${change.relativeTo} is not a screen on this computer`;
  return sideHolds(change.side, target, anchor)
    ? null
    : `${target.name} did not move ${change.side} of ${anchor.name}`;
}

function targetProblem(
  change: KeepableDisplayChange,
  target: DisplayOutput,
  outputs: readonly DisplayOutput[],
): string | null {
  switch (change.action) {
    case 'mode':
      return modeProblem(change, target);
    case 'scale':
      return Math.abs(target.scalePercent - change.percent) <= SCALE_TOLERANCE_PERCENT
        ? null
        : `${target.name} did not take the new scale`;
    case 'position':
      return positionProblem(change, target, outputs);
  }
}

export function displayKeepProblem(change: DisplayChange, applied: DisplayState): string | null {
  if (!displayChangeKeepable(change))
    return `${change.action} changes cannot be kept automatically`;
  if (!applied.outputs.some((output) => output.enabled)) return 'Every screen is off';
  const target = outputNamed(applied.outputs, change.output);
  if (target === null) return `${change.output} is not a screen on this computer`;
  if (!target.enabled) return `${target.name} is off`;
  return targetProblem(change, target, applied.outputs);
}
