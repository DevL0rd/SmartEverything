import type { HistoryPolicy, HistoryQuery } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SourceHistory } from '../../src/metrics/source-history';

const START = Date.parse('2026-10-17T10:00:00.000Z');

function history(policy: { current: HistoryPolicy }, now: { at: number }): SourceHistory {
  return new SourceHistory({ policyOf: () => policy.current, now: () => new Date(now.at) });
}

describe('source history', () => {
  it('records every reading of one moment in one row and answers them as columns', () => {
    const policy = { current: { interval_ms: 1000, window_ms: 60_000 } };
    const now = { at: START + 2000 };
    const sources = history(policy, now);
    sources.push('router', 'download_rate', 10, new Date(START));
    sources.push('router', 'upload_rate', 1, new Date(START));
    sources.push('router', 'download_rate', 20, new Date(START + 1000));
    const columns = sources.backfill('router', {
      topics: ['live'],
      maxPoints: 100,
      windowMs: 60_000,
    });
    expect(columns.timestamps).toEqual([START, START + 1000]);
    expect(columns.series).toEqual([
      { topic: 'live', key: 'download_rate', unit: null, values: [10, 20] },
      { topic: 'live', key: 'upload_rate', unit: null, values: [1, null] },
    ]);
    expect(columns.intervalMs).toBe(1000);
  });

  it('keeps one reading per recording interval and follows a changed interval', () => {
    const policy = { current: { interval_ms: 5000, window_ms: 60_000 } };
    const now = { at: START + 20_000 };
    const sources = history(policy, now);
    for (let second = 0; second < 12; second += 1) {
      sources.push('adguard', 'queries', second, new Date(START + second * 1000));
    }
    const query: HistoryQuery = { topics: ['live'], maxPoints: 100, sinceMs: START };
    expect(sources.backfill('adguard', query).timestamps).toEqual([
      START,
      START + 5000,
      START + 10_000,
    ]);
    policy.current = { interval_ms: 1000, window_ms: 60_000 };
    sources.retune();
    sources.push('adguard', 'queries', 12, new Date(START + 11_000));
    sources.push('adguard', 'queries', 13, new Date(START + 12_000));
    expect(sources.backfill('adguard', query).intervalMs).toBe(1000);
  });

  it('forgets readings older than the window', () => {
    const policy = { current: { interval_ms: 1000, window_ms: 60_000 } };
    const now = { at: START };
    const sources = history(policy, now);
    for (let second = 0; second < 90; second += 1) {
      sources.push('sync', 'rate', second, new Date(START + second * 1000));
    }
    now.at = START + 91_000;
    const columns = sources.backfill('sync', {
      topics: ['live'],
      maxPoints: 1000,
      windowMs: 60_000,
    });
    expect(columns.oldestMs).toBeGreaterThanOrEqual(START + 30_000);
    expect(columns.timestamps.length).toBeLessThanOrEqual(60);
  });
});
