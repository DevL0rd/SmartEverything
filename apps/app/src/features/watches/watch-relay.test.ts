import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchRelayStatus } from '../../../modules/health-connect';

const native = vi.hoisted(() => ({
  isHealthConnectLinked: true,
  openDndAccess: vi.fn(),
  openNotificationAccess: vi.fn(),
  phoneApps: vi.fn(),
  setWatchRelay: vi.fn(),
  watchRelayStatus: vi.fn(),
}));
const toast = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../../../modules/health-connect', () => native);
vi.mock('../../components/toast-store', () => toast);

const { RELAY_KEY, relayChangeOptions, relayStateOf } = await import('./watch-relay');

const STATUS: WatchRelayStatus = {
  enabled: true,
  apps: [],
  content: 'full',
  onlyWhenLocked: false,
  calls: false,
  music: false,
  findPhone: false,
  listenerAllowed: true,
  callPermissionsMissing: [],
  dndAllowed: true,
};
const CHANGED: WatchRelayStatus = { ...STATUS, enabled: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('watch relay state', () => {
  it('is unsupported where the native module is missing', () => {
    expect(relayStateOf(false, STATUS, null)).toEqual({ kind: 'unsupported' });
  });

  it('keeps showing the last good status when a later read fails', () => {
    expect(relayStateOf(true, STATUS, new Error('later read failed'))).toEqual({
      kind: 'ready',
      status: STATUS,
    });
  });

  it('only fails when there never was a status', () => {
    expect(relayStateOf(true, undefined, new Error('no native answer'))).toEqual({
      kind: 'failed',
      reason: 'no native answer',
    });
    expect(relayStateOf(true, undefined, null)).toEqual({ kind: 'loading' });
  });
});

describe('changing a relay setting', () => {
  it('stores the status the phone answered with', async () => {
    const client = new QueryClient();
    client.setQueryData(RELAY_KEY, STATUS);
    native.setWatchRelay.mockResolvedValue(CHANGED);
    await new MutationObserver(client, relayChangeOptions(client)).mutate({
      change: { enabled: false },
      askCallPermissions: false,
    });
    expect(client.getQueryData(RELAY_KEY)).toEqual(CHANGED);
  });

  it('keeps the status and shows a toast when the change fails', async () => {
    const client = new QueryClient();
    client.setQueryData(RELAY_KEY, STATUS);
    const failure = new Error('native refused');
    native.setWatchRelay.mockRejectedValue(failure);
    await expect(
      new MutationObserver(client, relayChangeOptions(client)).mutate({
        change: { enabled: false },
        askCallPermissions: false,
      }),
    ).rejects.toThrow('native refused');
    expect(client.getQueryData(RELAY_KEY)).toEqual(STATUS);
    expect(toast.notify).toHaveBeenCalledWith({
      message: 'The watch setting was not changed',
      error: failure,
      tone: 'critical',
    });
  });
});
