import { QueryClient, QueryObserver, type UseQueryOptions } from '@tanstack/react-query';
import type { UsageSummary, UsageTotals } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useCostSummary, useCostTotals } from './costs-data';
import type { CostParams } from './costs-params';
import { windowOf, type CostWindow } from './costs-range';

vi.mock('../../../api/transport', () => ({ api: vi.fn() }));
vi.mock('../../../queries/use-screen-query', () => ({ useScreenQuery: vi.fn() }));

const INITIAL: CostParams = { range: '30d' };
const TODAY = '2026-11-06';

function totalsOf({ from, to }: CostWindow, count: number): UsageTotals {
  return {
    from,
    to,
    sum: {
      tokens_in: 0,
      tokens_cached: 0,
      tokens_out: 0,
      tokens_reasoning: 0,
      audio_in_ms: 0,
      audio_out_ms: 0,
      images: 0,
      video_ms: 0,
      count,
      cost_micros: count * 100_000,
      pending_micros: 0,
      unknown_count: 0,
    },
    by: { work: [], source: [], model: [], profile: [], client: [], chat: [], plugin: [] },
  };
}

function summaryOf(window: CostWindow, count: number): UsageSummary {
  const { from, to, bucket } = window;
  return {
    totals: totalsOf(window, count),
    series: { from, to, bucket, time_zone: 'UTC', split: null, points: [] },
  };
}

type CostQuery = typeof useCostSummary | typeof useCostTotals;

function optionsOf(
  load: CostQuery,
  window: CostWindow,
  params: CostParams,
): UseQueryOptions<unknown, unknown> {
  load(window, params);
  const options = vi.mocked(useScreenQuery).mock.lastCall?.[0];
  if (options === undefined) {
    throw new Error('The cost query did not provide options.');
  }
  return { ...options, enabled: false };
}

describe.each([
  { name: 'summary', load: useCostSummary, dataOf: summaryOf },
  { name: 'breakdown totals', load: useCostTotals, dataOf: totalsOf },
])('$name range and filter transitions', ({ load, dataOf }) => {
  it.each<{ readonly name: string; readonly next: CostParams }>([
    { name: 'date range', next: { range: '7d' } },
    { name: 'model filter', next: { range: '30d', model: 'fixture-model' } },
  ])('shows pending data after changing the $name until its own result arrives', ({ next }) => {
    const client = new QueryClient();
    const previousWindow = windowOf(INITIAL, TODAY, 'UTC');
    const nextWindow = windowOf(next, TODAY, 'UTC');
    const previousOptions = optionsOf(load, previousWindow, INITIAL);
    const nextOptions = optionsOf(load, nextWindow, next);
    const previous = dataOf(previousWindow, 30);
    const current = dataOf(nextWindow, 7);
    client.setQueryData(previousOptions.queryKey, previous);
    const observer = new QueryObserver(client, previousOptions);
    try {
      expect(observer.getCurrentResult().data).toEqual(previous);

      observer.setOptions(nextOptions);
      expect(observer.getCurrentResult()).toMatchObject({
        isPending: true,
        isPlaceholderData: false,
        data: undefined,
      });

      client.setQueryData(nextOptions.queryKey, current);
      observer.setOptions(nextOptions);
      expect(observer.getCurrentResult().data).toEqual(current);

      observer.setOptions(previousOptions);
      expect(observer.getCurrentResult().data).toEqual(previous);
    } finally {
      client.clear();
    }
  });
});
