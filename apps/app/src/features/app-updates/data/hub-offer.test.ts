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
