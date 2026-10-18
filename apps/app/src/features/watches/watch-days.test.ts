import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchDayRow } from '@smarteverything/domain';
import { dayKeyOf } from '../../format/time';

type Query =
  | { isPending: true; isError: false }
  | { isPending: false; isError: true; error: Error }
  | { isPending: false; isError: false; data: readonly WatchDayRow[] };

const query = vi.hoisted((): { current: Query } => ({
  current: { isPending: true, isError: false },
}));
const requested = vi.hoisted((): { keys: unknown[] } => ({ keys: [] }));

vi.mock('../../store/clock', () => ({
  useDayKey: (): string => dayKeyOf(Date.parse('2026-10-16T10:00:00Z')),
}));
vi.mock('../../queries/use-screen-query', () => ({
  useScreenQuery: (options: { readonly queryKey: unknown }): Query => {
    requested.keys.push(options.queryKey);
    return query.current;
  },
}));
vi.mock('../../api/watches', () => ({ readWatchDays: vi.fn() }));

const { stressLevel, useWatchToday } = await import('./watch-days');

function rowOf(
  kind: WatchDayRow['kind'],
  samples: readonly (readonly [string, number])[],
): WatchDayRow {
  return {
    profile_id: '00000000-0000-4000-8000-000000000001',
    device_id: '00000000-0000-4000-8000-000000000002',
    day: '2026-10-16',
    kind,
    samples: samples.map(([time, value]) => ({ time, value })),
    updated_at: '2026-10-16T10:00:00.000Z',
  };
}

describe('useWatchToday', () => {
  beforeEach(() => {
    requested.keys.length = 0;
  });

  it('is loading while the query is pending and failed with its error', () => {
    query.current = { isPending: true, isError: false };
    expect(useWatchToday()).toEqual({ kind: 'loading' });
    const error = new Error('offline');
    query.current = { isPending: false, isError: true, error };
    expect(useWatchToday()).toEqual({ kind: 'failed', error });
  });

  it('asks for the local day of now, for that day only', () => {
    query.current = { isPending: true, isError: false };
    useWatchToday();
    expect(JSON.stringify(requested.keys[0])).toContain('2026-10-16');
  });

  it('sorts the samples of a kind by time and summarises them', () => {
    query.current = {
      isPending: false,
      isError: false,
      data: [
        rowOf('stress', [
          ['2026-10-16T09:00:00Z', 40],
          ['2026-10-16T07:00:00Z', 20],
        ]),
        rowOf('stress', [['2026-10-16T08:00:00Z', 90]]),
        rowOf('vitality', [['2026-10-16T08:00:00Z', 70]]),
      ],
    };
    const state = useWatchToday();
    if (state.kind !== 'ready') {
      throw new Error('not ready');
    }
    expect(state.stress.points.map((point) => point.v)).toEqual([20, 90, 40]);
    expect(state.stress).toMatchObject({ average: 50, maximum: 90, latest: 40 });
    expect(state.vitality).toMatchObject({ average: 70, maximum: 70, latest: 70 });
  });

  it('has no average, maximum or latest for a kind without samples', () => {
    query.current = { isPending: false, isError: false, data: [] };
    const state = useWatchToday();
    if (state.kind !== 'ready') {
      throw new Error('not ready');
    }
    expect(state.stress).toEqual({ points: [], average: null, maximum: null, latest: null });
  });
});

describe('stressLevel', () => {
  it.each([
    [0, 'Relaxed'],
    [25, 'Relaxed'],
    [26, 'Mild'],
    [50, 'Mild'],
    [51, 'Moderate'],
    [80, 'Moderate'],
    [81, 'High'],
  ])('calls a stress of %i %s', (value, level) => {
    expect(stressLevel(value)).toBe(level);
  });
});
