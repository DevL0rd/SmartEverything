export const MIN_RANGE = 0.03;

export interface Span {
  readonly start: number;
  readonly end: number;
}

function share(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function spanOf(progress: number, from: number | undefined): Span {
  const end = share(progress);
  if (from === undefined) {
    return { start: 0, end };
  }
  const start = share(from);
  return { start, end: Math.min(1, Math.max(end, start + MIN_RANGE)) };
}

export function markerLeft(width: number, marker: number, diameter: number): number {
  return width * share(marker) - diameter / 2;
}
