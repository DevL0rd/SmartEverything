import type { TrendPoint } from './stats-model';

export const TREND_HEIGHT = 120;
const PAD = 6;

export interface TrendFrame {
  readonly width: number;
  readonly min: number;
  readonly max: number;
}

function xOf(index: number, count: number, frame: TrendFrame): number {
  return count <= 1 ? frame.width / 2 : PAD + (index / (count - 1)) * (frame.width - 2 * PAD);
}

export function trendY(seconds: number, frame: TrendFrame): number {
  const span = Math.max(1, frame.max - frame.min);
  return TREND_HEIGHT - PAD - ((seconds - frame.min) / span) * (TREND_HEIGHT - 2 * PAD);
}

export function trendPath(
  points: readonly TrendPoint[],
  read: (point: TrendPoint) => number | null,
  frame: TrendFrame,
): string {
  let drawing = false;
  return points
    .map((point, index) => {
      const value = read(point);
      if (value === null) {
        drawing = false;
        return '';
      }
      const command = drawing ? 'L' : 'M';
      drawing = true;
      return `${command}${xOf(index, points.length, frame).toFixed(1)} ${trendY(value, frame).toFixed(1)}`;
    })
    .join(' ');
}
