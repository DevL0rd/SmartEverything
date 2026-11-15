import { APP_UPDATE_NOTICE } from '@smarteverything/domain';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { noticeRouter } from '../../../store/notice-registry';
import { ANDROID_APK_OFFER_KEY } from './android-apk';
import { APP_UPDATE_NOTICES } from './hub-offer';

const APK_QUERY_KEY = [...ANDROID_APK_OFFER_KEY, 'test-hub', { versionCode: '1' }] as const;

it('refreshes an Android installer offer published during the first read', async () => {
  const client = new QueryClient();
  const route = noticeRouter([APP_UPDATE_NOTICES], { client, store: new EntityStore() });
  let finishInitial: (offer: string | null) => void = () => undefined;
  const initial = new Promise<string | null>((resolve) => {
    finishInitial = resolve;
  });
  const queryFn = vi
    .fn<() => Promise<string | null>>()
    .mockReturnValueOnce(initial)
    .mockResolvedValueOnce('new installer');
  const observer = new QueryObserver(client, { queryKey: APK_QUERY_KEY, queryFn });
  let unsubscribe: () => void = () => undefined;
  const received = new Promise<string>((resolve) => {
    unsubscribe = observer.subscribe((result) => {
      if (result.data === 'new installer') resolve(result.data);
    });
  });
  try {
    expect(queryFn).toHaveBeenCalledOnce();
    const notice = APP_UPDATE_NOTICE.parse({
      type: 'app_update',
      id: '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11',
      platform: 'android',
      channel: 'release',
      runtimeVersion: 'apk-test',
    });
    expect(route(notice, true)).toBe(true);
    finishInitial(null);
    await expect(received).resolves.toBe('new installer');
    expect(queryFn).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
    client.clear();
  }
});

it('reads the Android installer offer again only when a replayed notice names a new release', async () => {
  const client = new QueryClient();
  const route = noticeRouter([APP_UPDATE_NOTICES], { client, store: new EntityStore() });
  const queryFn = vi.fn<() => Promise<string | null>>().mockResolvedValue('installer');
  const observer = new QueryObserver(client, { queryKey: APK_QUERY_KEY, queryFn });
  const unsubscribe = observer.subscribe(() => undefined);
  const notice = (id: string): ReturnType<typeof APP_UPDATE_NOTICE.parse> =>
    APP_UPDATE_NOTICE.parse({
      type: 'app_update',
      id,
      platform: 'android',
      channel: 'release',
      runtimeVersion: 'apk-replay',
    });
  try {
    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledOnce();
    });
    route(notice('2b7b7bba-ccd5-49f4-8f65-e752d82bcce2'), true);
    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
    route(notice('2b7b7bba-ccd5-49f4-8f65-e752d82bcce2'), true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queryFn).toHaveBeenCalledTimes(2);
    route(notice('fce9dc2e-a83e-4e3f-8c39-0e10ac091480'), true);
    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledTimes(3);
    });
    await client.cancelQueries();
    expect(queryFn).toHaveBeenCalledTimes(3);
  } finally {
    unsubscribe();
    client.clear();
  }
});
