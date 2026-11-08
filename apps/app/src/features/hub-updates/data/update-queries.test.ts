import { HUB_UPDATE_STATUS_CHANGED, type SelfUpdateRecoveryStatus } from '@smarteverything/domain';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { FEATURE_NOTICES } from '../../../store/live-feature-notices';
import { noticeRouter } from '../../../store/notice-registry';
import { refreshSourceAfterRelease } from './update-queries';

const RECOVERY_QUERY_KEY = ['hub-updates', 'recovery', 'test-hub', 'test-owner'] as const;
const RESTARTING: SelfUpdateRecoveryStatus = {
  release: {
    runId: 'd589fc4f-9cce-4033-ae3e-b838a0694bc8',
    phase: 'restarting',
    interrupted: false,
    startedAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:00.000Z',
    finishedAt: null,
  },
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('refreshes recovery status when a live notice arrives during the first read', async () => {
  const client = new QueryClient();
  const route = noticeRouter(FEATURE_NOTICES, { client, store: new EntityStore() });
  const first = deferred<SelfUpdateRecoveryStatus>();
  const secondStarted = deferred<null>();
  const second = deferred<SelfUpdateRecoveryStatus>();
  const received = deferred<SelfUpdateRecoveryStatus>();
  const queryFn = vi
    .fn<() => Promise<SelfUpdateRecoveryStatus>>()
    .mockReturnValueOnce(first.promise)
    .mockImplementationOnce(() => {
      secondStarted.resolve(null);
      return second.promise;
    });
  const observer = new QueryObserver(client, { queryKey: RECOVERY_QUERY_KEY, queryFn });
  const unsubscribe = observer.subscribe((result) => {
    if (result.isSuccess) received.resolve(result.data);
  });
  try {
    expect(queryFn).toHaveBeenCalledOnce();
    expect(
      route(HUB_UPDATE_STATUS_CHANGED.parse({ type: 'hub_update_status_changed' }), true),
    ).toBe(true);
    await secondStarted.promise;
    first.resolve({ release: null });
    second.resolve(RESTARTING);
    await expect(received.promise).resolves.toEqual(RESTARTING);
    expect(client.getQueryData(RECOVERY_QUERY_KEY)).toEqual(RESTARTING);
  } finally {
    unsubscribe();
    client.clear();
  }
});

const SOURCE_QUERY_KEY = ['hub-updates', 'source', 'test-hub', 'test-owner'] as const;
const OTHER_SOURCE_QUERY_KEY = ['hub-updates', 'source', 'other-hub', 'test-owner'] as const;
const DONE: SelfUpdateRecoveryStatus = {
  release: {
    runId: 'd589fc4f-9cce-4033-ae3e-b838a0694bc8',
    phase: 'done',
    interrupted: false,
    startedAt: '2026-11-06T00:00:00.000Z',
    updatedAt: '2026-11-06T00:00:01.000Z',
    finishedAt: '2026-11-06T00:00:01.000Z',
  },
};

it('drops a stale source offer and restarts its check when a release finishes', async () => {
  const client = new QueryClient();
  const stale = deferred<string>();
  const fresh = deferred<string>();
  const queryFn = vi
    .fn<() => Promise<string>>()
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(fresh.promise);
  client.setQueryData(SOURCE_QUERY_KEY, 'old offer');
  client.setQueryData(OTHER_SOURCE_QUERY_KEY, 'other home offer');
  const observer = new QueryObserver(client, { queryKey: SOURCE_QUERY_KEY, queryFn });
  const received = deferred<string>();
  const unsubscribe = observer.subscribe((result) => {
    if (result.data === 'fresh source') received.resolve(result.data);
  });
  try {
    expect(queryFn).toHaveBeenCalledTimes(1);
    refreshSourceAfterRelease({ release: null }, RESTARTING, client, SOURCE_QUERY_KEY);
    expect(queryFn).toHaveBeenCalledTimes(1);
    refreshSourceAfterRelease(RESTARTING, DONE, client, SOURCE_QUERY_KEY);
    expect(client.getQueryData(SOURCE_QUERY_KEY)).toBeUndefined();
    expect(client.getQueryData(OTHER_SOURCE_QUERY_KEY)).toBe('other home offer');
    expect(queryFn).toHaveBeenCalledTimes(2);
    stale.resolve('stale source');
    fresh.resolve('fresh source');
    await expect(received.promise).resolves.toBe('fresh source');
    refreshSourceAfterRelease(DONE, DONE, client, SOURCE_QUERY_KEY);
    expect(queryFn).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
    client.clear();
  }
});
