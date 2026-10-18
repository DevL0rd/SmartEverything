import type { ChartPoint } from '../../../components/charts';

const MIN_SPARK_POINTS = 2;

type SparkSource = 'live' | 'history' | 'none';

export interface SparkChoice {
  readonly source: SparkSource;
  readonly points: readonly ChartPoint[];
}

export function sparkChoice(
  ring: readonly ChartPoint[],
  history: readonly ChartPoint[] | undefined,
): SparkChoice {
  if (ring.length >= MIN_SPARK_POINTS) {
    return { source: 'live', points: ring };
  }
  if (history !== undefined && history.length >= MIN_SPARK_POINTS) {
    return { source: 'history', points: history };
  }
  return { source: 'none', points: [] };
}
