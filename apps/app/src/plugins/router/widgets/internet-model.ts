import { formatMegabits, type RouterSnapshot, type SpeedTestResult } from '@smarteverything/domain';
import type { Bar } from '../../../components/charts';
import { milliseconds } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { weekdayShort } from '../../../format/time';
import { canRunSpeedTest } from '../overview/hero-model';

export type RunControl =
  | { readonly kind: 'running'; readonly label: string }
  | { readonly kind: 'ready'; readonly label: string }
  | { readonly kind: 'blocked'; readonly label: string };

const HISTORY_BARS = 6;

function blockedReason(snapshot: RouterSnapshot): string {
  switch (snapshot.connection.state) {
    case 'online':
      return 'internet is down';
    case 'unreachable':
      return 'can’t reach the router';
    case 'paused':
      return 'monitoring is paused';
    case 'connecting':
    case 'not_set_up':
      return 'the router is not connected';
  }
}

export function runControlOf(
  snapshot: RouterSnapshot,
  run: { readonly running: boolean; readonly line: string | null },
): RunControl {
  if (run.running) {
    return { kind: 'running', label: run.line ?? 'Speed test running' };
  }
  return canRunSpeedTest(snapshot)
    ? { kind: 'ready', label: 'Run speed test' }
    : { kind: 'blocked', label: `Run speed test, unavailable: ${blockedReason(snapshot)}` };
}

export function readingLine(snapshot: RouterSnapshot, last: SpeedTestResult | null): string | null {
  const latency = snapshot.network?.latencyMs;
  const parts = [
    latency === null || latency === undefined ? null : milliseconds(latency),
    last === null ? null : `last test ${formatMegabits(last.downloadMbps)}`,
  ];
  const line = joinParts(parts);
  return line === '' ? null : line;
}

export function testBars(tests: readonly SpeedTestResult[]): readonly Bar[] {
  return tests
    .slice(0, HISTORY_BARS)
    .reverse()
    .map((test) => ({
      key: test.at,
      value: test.downloadMbps,
      label: weekdayShort(Date.parse(test.at)),
    }));
}

export function latestSample(
  snapshot: RouterSnapshot,
  pick: 'downloadMbps' | 'uploadMbps',
): { readonly at: number; readonly value: number } | null {
  return snapshot.connection.state === 'online' && snapshot.network !== null
    ? { at: Date.parse(snapshot.at), value: snapshot.network[pick] }
    : null;
}
