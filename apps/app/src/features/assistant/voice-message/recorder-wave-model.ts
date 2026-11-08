import { LEVEL_SAMPLE_MS, METERING_FLOOR_DB } from './voice-recorder-machine';

export interface LiveWaveShape {
  readonly bar: number;
  readonly gap: number;
  readonly height: number;
  readonly tallest: number;
  readonly lowest: number;
}

export const SHEET_WAVE: LiveWaveShape = { bar: 3, gap: 2, height: 40, tallest: 34, lowest: 3 };
export const HOLD_WAVE: LiveWaveShape = { bar: 2, gap: 2, height: 28, tallest: 20, lowest: 3 };

export interface LiveBars {
  readonly bars: readonly number[];
  readonly step: number;
}

export const NO_BARS: LiveBars = { bars: [], step: 0 };

export function liveBarCount(width: number, shape: LiveWaveShape): number {
  'worklet';
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.floor((width + shape.gap) / (shape.bar + shape.gap));
}

export function stepOf(elapsedMs: number): number {
  'worklet';
  return Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs / LEVEL_SAMPLE_MS) : 0;
}

export function pushLevel(
  state: LiveBars,
  count: number,
  elapsedMs: number,
  level: number,
): LiveBars {
  'worklet';
  const step = stepOf(elapsedMs);
  if (step < state.step || count <= 0) return { bars: [], step };
  const added = Math.min(count, step - state.step);
  if (added === 0) return state;
  const kept = state.bars.slice(Math.max(0, state.bars.length + added - count));
  const fresh: number[] = [];
  for (let index = 0; index < added; index += 1) fresh.push(level);
  return { bars: [...kept, ...fresh], step };
}

function fixed(value: number): string {
  'worklet';
  return value.toFixed(2);
}

function barPath(x: number, height: number, shape: LiveWaveShape): string {
  'worklet';
  const cap = shape.bar / 2;
  const top = (shape.height - height) / 2 + cap;
  return `M${fixed(x)} ${fixed(top)}a${fixed(cap)} ${fixed(cap)} 0 0 1 ${fixed(shape.bar)} 0v${fixed(Math.max(0, height - shape.bar))}a${fixed(cap)} ${fixed(cap)} 0 0 1 ${fixed(-shape.bar)} 0z`;
}

export function liveWavePath(
  bars: readonly number[],
  count: number,
  span: { readonly from: number; readonly to: number },
  shape: LiveWaveShape,
): string {
  'worklet';
  const pitch = shape.bar + shape.gap;
  const offset = count - bars.length;
  let path = '';
  const end = Math.min(bars.length, span.to);
  for (let index = Math.max(0, span.from); index < end; index += 1) {
    const level = Math.min(1, Math.max(0, bars[index] ?? 0));
    const height = shape.lowest + level * (shape.tallest - shape.lowest);
    path += barPath((offset + index) * pitch, height, shape);
  }
  return path;
}

export function decibelsOf(level: number): number {
  'worklet';
  const share = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return Math.round(METERING_FLOOR_DB * (1 - share));
}

export function dbText(db: number): string {
  return db < 0 ? `−${String(-db)} dB` : `${String(Math.abs(db))} dB`;
}

export function decibelCopy(level: number): string {
  return dbText(decibelsOf(level));
}

export function peakCopy(peak: number): string {
  return `peak ${decibelCopy(peak)}`;
}
