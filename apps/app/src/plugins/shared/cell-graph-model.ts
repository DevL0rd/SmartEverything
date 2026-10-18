import type { ChartPoint } from '../../components/charts';

export const MIN_LINE_POINTS = 2;

export function domainOf(series: readonly (readonly ChartPoint[])[]): readonly [number, number] {
  const peak = Math.max(0, ...series.flatMap((points) => points.map((point) => point.v)));
  return [0, peak === 0 ? 1 : peak];
}
