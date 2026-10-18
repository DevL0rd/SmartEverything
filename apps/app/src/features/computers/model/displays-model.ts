import type {
  DisplayMode,
  DisplayOutput,
  NightLight,
  PendingRevert,
} from '@smarteverything/domain';
import { DISPLAY_REVERT_SECONDS, type DISPLAY_SIDES } from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select';
import { decimal } from '../../../format/number';
import { joinParts } from '../../../format/text';

const SCALE_CHOICES = [100, 125, 150, 175, 200] as const;

export const SCALE_MIN = 50;

export const SCALE_MAX = 300;

export const SCALE_STEP = 5;

export const CUSTOM_SCALE = 'custom';

const ROTATION_LABELS = {
  0: 'Normal',
  90: 'Left',
  180: 'Upside down',
  270: 'Right',
} as const;

export type DisplaySide = (typeof DISPLAY_SIDES)[number];

export const SIDE_LABELS: Readonly<Record<DisplaySide, string>> = {
  left: 'Left of',
  right: 'Right of',
  above: 'Above',
  below: 'Below',
};

function hertz(refreshHz: number): string {
  return `${decimal(Math.round(refreshHz * 10) / 10, refreshHz % 1 === 0 ? 0 : 1)} Hz`;
}

export function resolutionText(mode: Pick<DisplayMode, 'width' | 'height'>): string {
  return `${decimal(mode.width)} × ${decimal(mode.height)}`;
}

export function modeLine(output: DisplayOutput): string {
  if (!output.enabled || output.mode === null) return joinParts(['Off', output.id]);
  return joinParts([
    resolutionText(output.mode),
    hertz(output.mode.refreshHz),
    `${decimal(output.scalePercent)} %`,
    output.id,
  ]);
}

const sizeKey = (mode: Pick<DisplayMode, 'width' | 'height'>): string =>
  `${String(mode.width)}x${String(mode.height)}`;

export function resolutionValue(output: DisplayOutput): string | null {
  return output.mode === null ? null : sizeKey(output.mode);
}

export function resolutionOptions(output: DisplayOutput): readonly SelectOption<string>[] {
  const seen = new Map<string, DisplayMode>();
  for (const mode of output.modes) {
    const key = sizeKey(mode);
    const known = seen.get(key);
    if (known === undefined || (mode.preferred && !known.preferred)) seen.set(key, mode);
  }
  return [...seen.entries()]
    .sort(([, a], [, b]) => b.width * b.height - a.width * a.height)
    .map(([value, mode]) => ({
      value,
      label: mode.preferred ? `${resolutionText(mode)} (preferred)` : resolutionText(mode),
    }));
}

export function refreshOptions(
  output: DisplayOutput,
  size: string | null,
): readonly SelectOption<string>[] {
  return output.modes
    .filter((mode) => sizeKey(mode) === size)
    .sort((a, b) => b.refreshHz - a.refreshHz)
    .map((mode) => ({ value: String(mode.refreshHz), label: hertz(mode.refreshHz) }));
}

export function modeOfChoice(
  output: DisplayOutput,
  size: string,
  refreshHz: string | null,
): DisplayMode | null {
  const sized = output.modes.filter((mode) => sizeKey(mode) === size);
  const exact = sized.find((mode) => String(mode.refreshHz) === refreshHz);
  if (exact !== undefined) return exact;
  return sized.reduce<DisplayMode | null>(
    (best, mode) => (best === null || mode.refreshHz > best.refreshHz ? mode : best),
    null,
  );
}

export function scaleOptions(): readonly SelectOption<string>[] {
  return [
    ...SCALE_CHOICES.map((percent) => ({ value: String(percent), label: `${String(percent)} %` })),
    { value: CUSTOM_SCALE, label: 'Custom…' },
  ];
}

export function isCustomScale(percent: number): boolean {
  return !SCALE_CHOICES.some((choice) => choice === percent);
}

export function rotationLabel(degrees: DisplayOutput['rotation']): string {
  return ROTATION_LABELS[degrees];
}

export const NIGHT_LIGHT_LABELS: Readonly<Record<NightLight['mode'], string>> = {
  off: 'Off',
  on: 'On',
  scheduled: 'Scheduled',
};

export function nightLightLine(light: NightLight): string | null {
  if (light.mode === 'off') return null;
  const kelvin = light.temperatureKelvin === null ? null : `${decimal(light.temperatureKelvin)} K`;
  if (light.mode === 'scheduled') {
    return light.active ? joinParts(['Active now', kelvin]) : 'Not active right now';
  }
  return kelvin;
}

export function isOnlyScreen(outputs: readonly DisplayOutput[], id: string): boolean {
  const on = outputs.filter((output) => output.enabled);
  return on.length === 1 && on[0]?.id === id;
}

export function mirrorOptions(
  outputs: readonly DisplayOutput[],
  id: string,
): readonly SelectOption<string>[] {
  return outputs
    .filter((output) => output.id !== id && output.enabled)
    .map((output) => ({ value: output.id, label: output.name }));
}

export interface Box {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Arrangement {
  readonly on: readonly Box[];
  readonly off: readonly Box[];
  readonly height: number;
  readonly factor: number;
}

const PAD = 12;
const GAP = 12;
const MAX_FACTOR = 0.16;
const OFF_WIDTH = 120;
const OFF_HEIGHT = 46;

function logicalSize(output: DisplayOutput): { readonly w: number; readonly h: number } {
  const mode = output.mode;
  if (mode === null) return { w: 1920, h: 1080 };
  const scale = output.scalePercent / 100;
  const turned = output.rotation === 90 || output.rotation === 270;
  const w = (turned ? mode.height : mode.width) / scale;
  const h = (turned ? mode.width : mode.height) / scale;
  return { w, h };
}

export function arrangementOf(outputs: readonly DisplayOutput[], width: number): Arrangement {
  const on = outputs.filter((output) => output.enabled);
  const sizes = on.map((output) => ({ output, ...logicalSize(output) }));
  const x0 = Math.min(0, ...sizes.map((item) => item.output.x));
  const y0 = Math.min(0, ...sizes.map((item) => item.output.y));
  const x1 = Math.max(1, ...sizes.map((item) => item.output.x + item.w));
  const y1 = Math.max(1, ...sizes.map((item) => item.output.y + item.h));
  const extent = x1 - x0;
  const factor = Math.min(MAX_FACTOR, (width - 2 * PAD) / extent);
  const boxes = sizes.map(({ output, w, h }): Box => ({
    id: output.id,
    left: PAD + (output.x - x0) * factor,
    top: PAD + (output.y - y0) * factor,
    width: w * factor,
    height: h * factor,
  }));
  const offOutputs = outputs.filter((output) => !output.enabled);
  const onHeight = on.length === 0 ? 0 : (y1 - y0) * factor;
  const offTop = PAD + onHeight + (on.length === 0 ? 0 : GAP);
  const off = offOutputs.map((output, index): Box => ({
    id: output.id,
    left: PAD + index * (OFF_WIDTH + GAP),
    top: offTop,
    width: OFF_WIDTH,
    height: OFF_HEIGHT,
  }));
  const height = offOutputs.length === 0 ? offTop + PAD : offTop + OFF_HEIGHT + PAD;
  return { on: boxes, off, height, factor };
}

export interface Drop {
  readonly relativeTo: string;
  readonly side: DisplaySide;
}

const MIN_DRAG = 12;

function nearest(boxes: readonly Box[], id: string, x: number, y: number): Box | null {
  let best: { readonly box: Box; readonly distance: number } | null = null;
  for (const box of boxes) {
    if (box.id === id) continue;
    const distance = Math.hypot(box.left + box.width / 2 - x, box.top + box.height / 2 - y);
    if (best === null || distance < best.distance) best = { box, distance };
  }
  return best === null ? null : best.box;
}

function sideOf(box: Box, x: number, y: number): DisplaySide {
  const offX = x - (box.left + box.width / 2);
  const offY = y - (box.top + box.height / 2);
  if (Math.abs(offX / box.width) >= Math.abs(offY / box.height)) return offX < 0 ? 'left' : 'right';
  return offY < 0 ? 'above' : 'below';
}

export function dropOf(boxes: readonly Box[], id: string, dx: number, dy: number): Drop | null {
  const moved = boxes.find((box) => box.id === id);
  if (moved === undefined || Math.abs(dx) + Math.abs(dy) < MIN_DRAG) return null;
  const x = moved.left + moved.width / 2 + dx;
  const y = moved.top + moved.height / 2 + dy;
  const target = nearest(boxes, id, x, y);
  return target === null ? null : { relativeTo: target.id, side: sideOf(target, x, y) };
}

export function remainingSeconds(pending: PendingRevert, now: number): number {
  const left = Math.ceil((Date.parse(pending.revertsAt) - now) / 1000);
  return Math.max(0, Math.min(DISPLAY_REVERT_SECONDS, left));
}
