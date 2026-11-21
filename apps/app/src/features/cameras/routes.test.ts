import { QueryClient } from '@tanstack/react-query';
import { ApiError, type DeviceCapability } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceFixture, stateFixture } from '../../store/device-fixture';

const calls = vi.hoisted(() => ({
  links: new Array<string>(),
  prefetched: new Array<string>(),
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Image: {
    prefetch: (url: string): Promise<boolean> => {
      calls.prefetched.push(url);
      return Promise.resolve(true);
    },
  },
}));

vi.mock('../../api/transport', () => ({
  api: (): object => ({
    call: (): Promise<readonly { device_id: string }[]> =>
      Promise.resolve([
        { device_id: 'open' },
        { device_id: 'private' },
        { device_id: 'offline' },
        { device_id: 'down' },
      ]),
  }),
}));

vi.mock('../../api/media', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cameraSnapshotLink: (deviceId: string): Promise<{ url: string; expiresAt: string }> => {
    calls.links.push(deviceId);
    if (deviceId === 'down') {
      return Promise.reject(new ApiError('firewall_blocked', 'down'));
    }
    return Promise.resolve({ url: `snap:${deviceId}`, expiresAt: '2099-01-01T00:00:00.000Z' });
  },
}));

const { preloadCameras } = await import('./routes');

const STAMP = '2026-11-21T08:00:00.000Z';

const PRIVACY: DeviceCapability = {
  key: 'privacy_mode',
  label: 'Privacy',
  access: 'read_write',
  value: { kind: 'boolean' },
};

const STATE = stateFixture(
  [
    deviceFixture(0, { id: 'open', kind: 'camera', capabilities: [PRIVACY] }),
    deviceFixture(1, { id: 'private', kind: 'camera', capabilities: [PRIVACY] }),
    deviceFixture(2, { id: 'offline', kind: 'camera', online: false, capabilities: [PRIVACY] }),
    deviceFixture(3, { id: 'down', kind: 'camera', capabilities: [PRIVACY] }),
  ],
  {
    open: { privacy_mode: { value: false, observedAt: STAMP } },
    private: { privacy_mode: { value: true, observedAt: STAMP } },
    down: { privacy_mode: { value: false, observedAt: STAMP } },
  },
);

beforeEach(() => {
  calls.links.length = 0;
  calls.prefetched.length = 0;
});

describe('camera preload', () => {
  it('fetches snapshots only for cameras that can stream', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    await expect(preloadCameras({ queryClient, state: () => STATE })).rejects.toThrow('down');
    expect(calls.links).toEqual(['open', 'down']);
    expect(calls.prefetched).toEqual(['snap:open']);
    queryClient.clear();
  });

  it('asks a refused camera once across every camera route preload', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    await expect(preloadCameras({ queryClient, state: () => STATE })).rejects.toThrow('down');
    await preloadCameras({ queryClient, state: () => STATE });
    await preloadCameras({ queryClient, state: () => STATE });
    expect(calls.links.filter((id) => id === 'down')).toHaveLength(1);
    queryClient.clear();
  });
});
