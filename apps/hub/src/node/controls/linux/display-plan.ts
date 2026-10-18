import type { DisplayChange, DisplayMode, DisplayOutput } from '@smarteverything/domain';
import { NodeFailureError } from '../../node-failure';
import type { BackendChange } from './display-backend';

const REFRESH_MATCH_HZ = 1;
const QUARTER_TURN = 90;

function resolveOutput(outputs: readonly DisplayOutput[], reference: string): DisplayOutput {
  const wanted = reference.toLowerCase();
  const match =
    outputs.find((output) => output.id === reference) ??
    outputs.find((output) => output.id.toLowerCase() === wanted) ??
    outputs.find((output) => output.name.toLowerCase() === wanted);
  if (match === undefined) {
    throw new NodeFailureError('not_found', `No display matches "${reference}".`);
  }
  return match;
}

function enabledCount(outputs: readonly DisplayOutput[]): number {
  return outputs.filter((output) => output.enabled).length;
}

export function isOnlyActive(outputs: readonly DisplayOutput[], reference: string): boolean {
  const target = resolveOutput(outputs, reference);
  return target.enabled && enabledCount(outputs) === 1;
}

function logicalSize(output: DisplayOutput): { width: number; height: number } {
  const mode = output.mode;
  if (mode === null) {
    throw new NodeFailureError('failed', `${output.name} is off, so it has no size to place.`);
  }
  const turned = output.rotation % 180 === QUARTER_TURN;
  const scale = output.scalePercent / 100;
  return {
    width: Math.round((turned ? mode.height : mode.width) / scale),
    height: Math.round((turned ? mode.width : mode.height) / scale),
  };
}

function pickMode(
  output: DisplayOutput,
  width: number,
  height: number,
  refreshHz: number | undefined,
): DisplayMode {
  const sized = output.modes.filter((mode) => mode.width === width && mode.height === height);
  const closest =
    refreshHz === undefined
      ? sized.toSorted((left, right) => right.refreshHz - left.refreshHz)
      : sized
          .filter((mode) => Math.abs(mode.refreshHz - refreshHz) <= REFRESH_MATCH_HZ)
          .toSorted(
            (left, right) =>
              Math.abs(left.refreshHz - refreshHz) - Math.abs(right.refreshHz - refreshHz),
          );
  const mode = closest[0];
  if (mode === undefined) {
    const rate = refreshHz === undefined ? '' : ` at ${String(refreshHz)} Hz`;
    throw new NodeFailureError(
      'failed',
      `${output.name} has no ${String(width)}x${String(height)} mode${rate}.`,
    );
  }
  return mode;
}

function placed(
  target: DisplayOutput,
  anchor: DisplayOutput,
  side: 'left' | 'right' | 'above' | 'below',
): BackendChange {
  const size = logicalSize(target);
  const anchorSize = logicalSize(anchor);
  switch (side) {
    case 'left':
      return { kind: 'position', output: target.id, x: anchor.x - size.width, y: anchor.y };
    case 'right':
      return { kind: 'position', output: target.id, x: anchor.x + anchorSize.width, y: anchor.y };
    case 'above':
      return { kind: 'position', output: target.id, x: anchor.x, y: anchor.y - size.height };
    case 'below':
      return { kind: 'position', output: target.id, x: anchor.x, y: anchor.y + anchorSize.height };
  }
}

function brightnessTargets(
  outputs: readonly DisplayOutput[],
  reference: string | undefined,
): readonly DisplayOutput[] {
  if (reference !== undefined) {
    return [resolveOutput(outputs, reference)];
  }
  return outputs.filter((output) => output.enabled && output.brightness !== null);
}

type LayoutChange = Extract<
  DisplayChange,
  { action: 'enable' | 'disable' | 'mode' | 'scale' | 'rotation' | 'primary' | 'position' }
>;

type AdjustChange = Extract<DisplayChange, { action: 'hdr' | 'vrr' | 'brightness' }>;

function planLayout(change: LayoutChange, outputs: readonly DisplayOutput[]): BackendChange {
  if (change.action === 'position') {
    return placed(
      resolveOutput(outputs, change.output),
      resolveOutput(outputs, change.relativeTo),
      change.side,
    );
  }
  const output = resolveOutput(outputs, change.output);
  switch (change.action) {
    case 'enable':
    case 'disable':
      return { kind: 'enabled', output: output.id, enabled: change.action === 'enable' };
    case 'mode':
      return {
        kind: 'mode',
        output: output.id,
        mode: pickMode(output, change.width, change.height, change.refreshHz),
      };
    case 'scale':
      return { kind: 'scale', output: output.id, percent: change.percent };
    case 'rotation':
      return { kind: 'rotation', output: output.id, degrees: change.degrees };
    case 'primary':
      return { kind: 'primary', output: output.id };
  }
}

function planAdjust(
  change: AdjustChange,
  outputs: readonly DisplayOutput[],
): readonly BackendChange[] {
  switch (change.action) {
    case 'hdr':
      return [hdrChange(resolveOutput(outputs, change.output), change.enabled)];
    case 'vrr':
      return [vrrChange(resolveOutput(outputs, change.output), change.policy)];
    case 'brightness':
      return brightnessTargets(outputs, change.output).map((output) => ({
        kind: 'brightness',
        output: output.id,
        level: change.level,
      }));
  }
}

const LAYOUT_ACTIONS: readonly DisplayChange['action'][] = [
  'enable',
  'disable',
  'mode',
  'scale',
  'rotation',
  'primary',
  'position',
];

const ADJUST_ACTIONS: readonly DisplayChange['action'][] = ['hdr', 'vrr', 'brightness'];

function isLayoutChange(change: DisplayChange): change is LayoutChange {
  return LAYOUT_ACTIONS.includes(change.action);
}

function isAdjustChange(change: DisplayChange): change is AdjustChange {
  return ADJUST_ACTIONS.includes(change.action);
}

export function planDisplayChange(
  change: DisplayChange,
  outputs: readonly DisplayOutput[],
): readonly BackendChange[] {
  if (isLayoutChange(change)) {
    return [planLayout(change, outputs)];
  }
  if (isAdjustChange(change)) {
    return planAdjust(change, outputs);
  }
  throw new NodeFailureError(
    'not_supported',
    change.action === 'mirror'
      ? 'Mirroring displays is not available on this computer yet.'
      : `${change.action} is not a display output change.`,
  );
}

function hdrChange(output: DisplayOutput, enabled: boolean): BackendChange {
  if (!output.hdr.supported) {
    throw new NodeFailureError('not_supported', `${output.name} does not support HDR.`);
  }
  return { kind: 'hdr', output: output.id, enabled };
}

function vrrChange(output: DisplayOutput, policy: string): BackendChange {
  if (output.vrr === null) {
    throw new NodeFailureError('not_supported', `${output.name} does not support adaptive sync.`);
  }
  return { kind: 'vrr', output: output.id, policy };
}

function describeMode(name: string, change: Extract<DisplayChange, { action: 'mode' }>): string {
  const rate = change.refreshHz === undefined ? '' : ` at ${String(change.refreshHz)} Hz`;
  return `Set ${name} to ${String(change.width)}x${String(change.height)}${rate}`;
}

const PHRASES: Readonly<
  Record<'enable' | 'disable' | 'primary' | 'mirror' | 'hdr' | 'vrr', (name: string) => string>
> = {
  enable: (name) => `Turned on ${name}`,
  disable: (name) => `Turned off ${name}`,
  primary: (name) => `Made ${name} the main display`,
  mirror: (name) => `Changed mirroring of ${name}`,
  hdr: (name) => `Changed HDR on ${name}`,
  vrr: (name) => `Changed adaptive sync on ${name}`,
};

function describeLayout(
  change: Extract<DisplayChange, { output: string }>,
  name: string,
  outputs: readonly DisplayOutput[],
): string {
  if (change.action === 'mode') {
    return describeMode(name, change);
  }
  if (change.action === 'scale') {
    return `Set ${name} scale to ${String(change.percent)}%`;
  }
  if (change.action === 'rotation') {
    return `Rotated ${name} to ${String(change.degrees)} degrees`;
  }
  if (change.action === 'position') {
    return `Moved ${name} ${change.side} of ${resolveOutput(outputs, change.relativeTo).name}`;
  }
  return PHRASES[change.action](name);
}

export function describeChange(change: DisplayChange, outputs: readonly DisplayOutput[]): string {
  if (change.action === 'night_light' || change.action === 'identify') {
    return `Changed ${change.action.replaceAll('_', ' ')}`;
  }
  if (change.action === 'brightness') {
    return 'Changed brightness';
  }
  return describeLayout(change, resolveOutput(outputs, change.output).name, outputs);
}
