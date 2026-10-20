import type { BrushLiveFrame } from '@smarteverything/domain';

export const TRACE_WINDOW_S = 60;

export interface TraceSample {
  readonly atMs: number;
  readonly force: number;
}

export function appendSample(
  trace: readonly TraceSample[],
  frame: Pick<BrushLiveFrame, 'at' | 'force' | 'activity'>,
): readonly TraceSample[] {
  const atMs = Date.parse(frame.at);
  const last = trace.at(-1);
  if (frame.force === null || frame.activity !== 'brushing') {
    return trace;
  }
  if (last !== undefined && atMs <= last.atMs) {
    return trace;
  }
  const cutoff = atMs - TRACE_WINDOW_S * 1000;
  return [...trace.filter((sample) => sample.atMs >= cutoff), { atMs, force: frame.force }];
}

export interface TracePoint {
  readonly x: number;
  readonly y: number;
}

export function tracePoints(
  trace: readonly TraceSample[],
  max: number,
  size: { readonly width: number; readonly height: number },
): readonly TracePoint[] {
  const last = trace.at(-1);
  if (last === undefined) {
    return [];
  }
  const span = TRACE_WINDOW_S * 1000;
  return trace.map((sample) => ({
    x: size.width * (1 - (last.atMs - sample.atMs) / span),
    y: size.height * (1 - Math.min(1, Math.max(0, sample.force / max))),
  }));
}

export function pathOf(points: readonly TracePoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

export function stripWindow(strip: readonly (0 | 1 | 2)[]): readonly (0 | 1 | 2)[] {
  return strip.slice(-TRACE_WINDOW_S);
}

export function traceLabel(kind: 'force' | 'state', lastBand: string | null): string {
  const what =
    kind === 'force'
      ? 'Pressure over the last 60 seconds'
      : 'Pressure state over the last 60 seconds';
  return lastBand === null ? what : `${what}, now ${lastBand.toLowerCase()}`;
}

const STATE_SHARE: Readonly<Record<0 | 1 | 2, number>> = { 0: 0.17, 1: 0.5, 2: 0.83 };

export function stripShares(strip: readonly (0 | 1 | 2)[]): readonly number[] {
  return stripWindow(strip).map((code) => STATE_SHARE[code]);
}

export function sharePath(
  shares: readonly number[],
  size: { readonly width: number; readonly height: number },
): string {
  if (shares.length === 0) {
    return '';
  }
  const step = shares.length > 1 ? size.width / (TRACE_WINDOW_S - 1) : 0;
  const offset = size.width - step * (shares.length - 1);
  return shares
    .map((share, index) => {
      const x = offset + step * index;
      const y = size.height * (1 - share);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
