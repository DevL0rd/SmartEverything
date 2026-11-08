import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { plannerKeys } from '../../../queries/keys';
import { reloadPlanner } from './reload';

const PERSON = 'a1b2c3d4-0000-4000-8000-000000000001';

function watched(client: QueryClient, queryFn: () => Promise<string>): () => void {
  const observer = new QueryObserver(client, {
    queryKey: plannerKeys.day(PERSON, '2026-11-07'),
    queryFn,
    staleTime: Infinity,
  });
  return observer.subscribe(() => undefined);
}

describe('reloadPlanner', () => {
  it('syncs Google only when it is linked', async () => {
    const client = new QueryClient();
    const sync = vi.fn(() => Promise.resolve());
    await reloadPlanner({ client, linked: false, sync });
    expect(sync).not.toHaveBeenCalled();
    await reloadPlanner({ client, linked: true, sync });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('refetches the visible planner queries and leaves other queries alone', async () => {
    const client = new QueryClient();
    const day = vi.fn(() => Promise.resolve('day'));
    const other = vi.fn(() => Promise.resolve('other'));
    const stop = watched(client, day);
    const unrelated = new QueryObserver(client, {
      queryKey: ['window', 'health', 'daily'],
      queryFn: other,
      staleTime: Infinity,
    }).subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(client.getQueryState(plannerKeys.day(PERSON, '2026-11-07'))?.status).toBe('success');
    });
    await reloadPlanner({ client, linked: false, sync: () => Promise.resolve() });
    expect(day).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(1);
    stop();
    unrelated();
  });

  it('reports a failed sync to the caller', async () => {
    const client = new QueryClient();
    await expect(
      reloadPlanner({ client, linked: true, sync: () => Promise.reject(new Error('offline')) }),
    ).rejects.toThrow('offline');
  });
});
