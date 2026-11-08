import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { FEATURE_NOTICES } from '../../../store/live-feature-notices';
import { noticeRouter } from '../../../store/notice-registry';
import { HUB_UPDATE_SOURCE_KEY } from './source-notices';

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('refreshes a connected owner while the first source request is pending', async () => {
  const client = new QueryClient();
  const route = noticeRouter(FEATURE_NOTICES, { client, store: new EntityStore() });
  const key = [...HUB_UPDATE_SOURCE_KEY, 'fixture-hub', 'fixture-owner'];
  const first = deferred<string>();
  const secondStarted = deferred<void>();
  const second = deferred<string>();
  const received = deferred<string>();
  const queryFn = vi
    .fn<() => Promise<string>>()
    .mockReturnValueOnce(first.promise)
    .mockImplementationOnce(() => {
      secondStarted.resolve();
      return second.promise;
    });
  const observer = new QueryObserver(client, { queryKey: key, queryFn });
  const unsubscribe = observer.subscribe((result) => {
    if (result.isSuccess) received.resolve(result.data);
  });
  try {
    expect(queryFn).toHaveBeenCalledOnce();
    expect(route({ type: 'hub_update_source_changed' }, true)).toBe(true);
    await secondStarted.promise;
    first.resolve('previous tip');
    second.resolve('new tip');
    await expect(received.promise).resolves.toBe('new tip');
    expect(client.getQueryData(key)).toBe('new tip');
  } finally {
    unsubscribe();
    client.clear();
  }
});
