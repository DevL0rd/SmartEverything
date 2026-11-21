import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_PREFIX } from '../../../queries/keys';
import type { QueryOptions } from './queries';

interface Pending {
  readonly route: string;
  readonly signal: AbortSignal;
  readonly answer: (value: unknown) => void;
}

const pending: Pending[] = [];

vi.mock('../../../api/transport', () => ({
  api: (): {
    call: (
      endpoint: { path: string },
      input: unknown,
      options: { signal?: AbortSignal } | undefined,
    ) => Promise<unknown>;
  } => ({
    call: (endpoint, _input, options): Promise<unknown> => {
      const signal = options?.signal;
      if (signal === undefined) {
        return Promise.reject(new Error(`${endpoint.path} was called without an abort signal`));
      }
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Error(`${endpoint.path} was aborted`));
        });
        pending.push({ route: endpoint.path, signal, answer: resolve });
      });
    },
  }),
}));

vi.mock('../../watches', () => ({ useMyLiveToday: (): never[] => [] }));

const { bestDayQuery, dailyQuery, recordsQuery, sightingsQuery } = await import('./queries');

type Observe = (client: QueryClient) => { subscribe: QueryObserver['subscribe'] };

function observerOf<T>(options: QueryOptions<T>): Observe {
  return (client) => new QueryObserver(client, options);
}

const QUERIES: readonly (readonly [string, Observe])[] = [
  ['daily figures', observerOf(dailyQuery('2026-11-01', '2026-11-07', ['steps']))],
  ['records', observerOf(recordsQuery(['HeartRate'], 0, 86_400_000))],
  ['best day', observerOf(bestDayQuery('heart_rate_maximum', false))],
  ['sightings', observerOf(sightingsQuery('2026-11-21'))],
];

afterEach(() => {
  pending.length = 0;
});

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('health queries abort superseded requests', () => {
  it.each(QUERIES)(
    'an invalidation burst aborts every superseded %s request',
    async (_name, observe) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const observer = observe(client);
      const unsubscribe = observer.subscribe(() => undefined);
      await settled();
      expect(pending).toHaveLength(1);
      pending[0]?.answer([]);
      await settled();
      const bursts = Array.from({ length: 5 }, () =>
        client.invalidateQueries({ queryKey: HEALTH_PREFIX }),
      );
      await settled();
      expect(pending).toHaveLength(6);
      const superseded = pending.slice(1, -1);
      expect(superseded.every((request) => request.signal.aborted)).toBe(true);
      const latest = pending.at(-1);
      expect(latest?.signal.aborted).toBe(false);
      latest?.answer([]);
      await Promise.all(bursts);
      unsubscribe();
      client.clear();
    },
  );
});
