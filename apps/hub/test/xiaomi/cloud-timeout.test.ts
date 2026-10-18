import { afterEach, describe, expect, it, vi } from 'vitest';
import { XiaomiCloud, XiaomiNetworkError } from '../../src/adapters/xiaomi/cloud-api';
import { dependencies } from './harness';
import { SSECURITY, USER_ID } from './fake-account';
import { testLogger } from '../support/logs';

const SECRETS = {
  userId: USER_ID,
  passToken: 'pass',
  ssecurity: SSECURITY,
  serviceToken: 'service',
  deviceId: 'device',
  region: 'de',
} as const;

function cloudOver(fetch: Parameters<typeof dependencies>[0]): XiaomiCloud {
  return new XiaomiCloud(dependencies(fetch, 0), SECRETS, {
    saveSecrets: () => Promise.resolve(),
    needsAttention: () => Promise.resolve(),
    log: testLogger('xiaomi-cloud'),
  });
}

function hangingUntilAborted(): Parameters<typeof dependencies>[0] {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Xiaomi cloud request timeout', () => {
  it('reports a network error naming the path when the cloud does not answer in time', async () => {
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const call = cloudOver(hangingUntilAborted())
      .call('/home/device_list', {})
      .then(
        () => null,
        (error: unknown) => error,
      );
    timeout.abort();
    const failure = await call;
    expect(failure).toBeInstanceOf(XiaomiNetworkError);
    expect(failure).toMatchObject({
      path: '/home/device_list',
      cause: { name: 'XiaomiCloudTimeoutError' },
    });
  });

  it('gives up at the caller deadline when the session renewal never answers', async () => {
    const outer = new AbortController();
    const renewal = new AbortController();
    const timeouts = [outer.signal, renewal.signal];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeouts.shift() ?? renewal.signal);
    const cloud = cloudOver((url) =>
      url.includes('serviceLogin')
        ? new Promise<Response>(() => undefined)
        : Promise.resolve(new Response('', { status: 401 })),
    );
    const call = cloud.call('/home/device_list', {}).then(
      () => null,
      (error: unknown) => error,
    );
    await vi.waitFor(() => {
      expect(timeouts).toHaveLength(0);
    });
    outer.abort();
    const failure = await call;
    expect(failure).toBeInstanceOf(XiaomiNetworkError);
    expect(failure).toMatchObject({
      path: '/home/device_list',
      cause: { name: 'XiaomiCloudTimeoutError' },
    });
  });

  it('keeps the original error when the request fails before the deadline', async () => {
    const failure = await cloudOver(() => Promise.reject(new TypeError('connection refused')))
      .call('/home/device_list', {})
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(XiaomiNetworkError);
    expect(String(failure)).toContain('connection refused');
  });
});
