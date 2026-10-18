import type { SpeedTestResult } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import { localDayKey } from '../../../format/time';
import { compareText } from '../../../format/text';

export function dailyTests(tests: readonly SpeedTestResult[]): readonly SpeedTestResult[] {
  const newestOfDay = new Map<string, SpeedTestResult>();
  for (const test of tests) {
    const day = localDayKey(test.at);
    const known = newestOfDay.get(day);
    if (known === undefined || known.at < test.at) {
      newestOfDay.set(day, test);
    }
  }
  return [...newestOfDay.values()].sort((left, right) => compareText(left.at, right.at));
}

export interface SpeedHistorySeries {
  readonly download: readonly ChartPoint[];
  readonly upload: readonly ChartPoint[];
}

export function speedHistory(tests: readonly SpeedTestResult[]): SpeedHistorySeries {
  const daily = dailyTests(tests);
  return {
    download: daily.map((test) => ({ t: Date.parse(test.at), v: test.downloadMbps })),
    upload: daily.map((test) => ({ t: Date.parse(test.at), v: test.uploadMbps })),
  };
}

type Scales = readonly [number, ...number[]];

const DOWNLOAD_SCALES: Scales = [100, 250, 500, 1000, 2500, 5000, 10_000];
const UPLOAD_SCALES: Scales = [25, 50, 100, 250, 500, 1000, 5000];
const PING_SCALE = 100;
const HEADROOM = 1.25;

function niceScale(best: number, scales: Scales): number {
  const target = best * HEADROOM;
  const fitting = scales.filter((scale) => scale >= best);
  return fitting.length === 0
    ? Math.max(...scales)
    : fitting.reduce((nearest, scale) =>
        Math.abs(scale - target) < Math.abs(nearest - target) ? scale : nearest,
      );
}

export type GaugePhase = 'ping' | 'download' | 'upload';

export function gaugeMax(
  phase: GaugePhase,
  best: { readonly downloadMbps: number; readonly uploadMbps: number } | null,
): number {
  if (phase === 'ping') {
    return PING_SCALE;
  }
  if (phase === 'download') {
    return niceScale(best?.downloadMbps ?? 0, DOWNLOAD_SCALES);
  }
  return niceScale(best?.uploadMbps ?? 0, UPLOAD_SCALES);
}

export function lineShare(
  downloadMbps: number,
  last: { readonly downloadMbps: number } | null,
): number | null {
  if (last === null || last.downloadMbps <= 0) {
    return null;
  }
  return Math.min(1, downloadMbps / last.downloadMbps);
}
