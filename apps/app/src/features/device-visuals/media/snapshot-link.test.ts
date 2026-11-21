import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { ApiError, type DeviceCapability } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceFixture, stateFixture } from '../../../store/device-fixture';

const media = vi.hoisted(() => ({
  link: vi.fn<(deviceId: string) => Promise<{ url: string; expiresAt: string }>>(),
}));

vi.mock('../../../api/media', () => ({
  cameraSnapshotLink: (deviceId: string): Promise<{ url: string; expiresAt: string }> =>
    media.link(deviceId),
  linkLifetimeMs: (): number => 60_000,
}));

const { snapshotConditionOf, snapshotQuery } = await import('./snapshot-link');

const STAMP = '2026-11-21T08:00:00.000Z';

const PRIVACY: DeviceCapability = {
  key: 'privacy_mode',
  label: 'Privacy',
  access: 'read_write',
  value: { kind: 'boolean' },
};

const STREAMABLE = { condition: 'streamable', reach: 'open' } as const;

function camera(online: boolean): ReturnType<typeof deviceFixture> {
  return deviceFixture(0, { id: 'cam', kind: 'camera', online, capabilities: [PRIVACY] });
}

let client: QueryClient;

beforeEach(() => {
  media.link.mockReset();
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: 1, retryDelay: 0 } },
  });
});

afterEach(() => {
  client.clear();
});

async function mountTile(readiness: Parameters<typeof snapshotQuery>[2]): Promise<void> {
  const observer = new QueryObserver(client, snapshotQuery('cam', 'thumb', readiness));
  const off = observer.subscribe(() => undefined);
  await vi.waitFor(() => {
    expect(observer.getCurrentResult().fetchStatus).toBe('idle');
  });
  off();
}

describe('snapshot readiness', () => {
  it('reads a camera with privacy on as private and an offline camera as offline', () => {
    const privacyOn = stateFixture([camera(true)], {
      cam: { privacy_mode: { value: true, observedAt: STAMP } },
    });
    const privacyOff = stateFixture([camera(true)], {
      cam: { privacy_mode: { value: false, observedAt: STAMP } },
    });
    expect(snapshotConditionOf(privacyOn, 'cam')).toBe('private');
    expect(snapshotConditionOf(privacyOff, 'cam')).toBe('streamable');
    expect(snapshotConditionOf(stateFixture([camera(false)], {}), 'cam')).toBe('offline');
    expect(snapshotConditionOf(stateFixture([], {}), 'cam')).toBe('offline');
  });
});

describe('refused camera snapshot', () => {
  it('asks a refused camera once across many tile mounts', async () => {
    media.link.mockRejectedValue(new ApiError('firewall_blocked', 'down'));
    for (let tile = 0; tile < 6; tile += 1) {
      await mountTile(STREAMABLE);
    }
    expect(media.link).toHaveBeenCalledTimes(1);
  });

  it('asks a refused camera once when an observer built before the refusal subscribes later', async () => {
    media.link.mockRejectedValue(new ApiError('firewall_blocked', 'down'));
    const early = new QueryObserver(client, snapshotQuery('cam', 'thumb', STREAMABLE));
    await mountTile(STREAMABLE);
    const off = early.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(early.getCurrentResult().fetchStatus).toBe('idle');
    });
    off();
    expect(media.link).toHaveBeenCalledTimes(1);
  });

  it('asks again once when the camera state changes', async () => {
    media.link.mockRejectedValue(new ApiError('camera_offline', 'down'));
    await mountTile(STREAMABLE);
    await mountTile(STREAMABLE);
    await mountTile({ condition: 'streamable', reach: 'blocked' });
    await mountTile({ condition: 'streamable', reach: 'blocked' });
    expect(media.link).toHaveBeenCalledTimes(2);
  });

  it('never asks a camera with privacy on or offline', async () => {
    media.link.mockResolvedValue({ url: 'x', expiresAt: STAMP });
    await mountTile({ condition: 'private', reach: 'open' });
    await mountTile({ condition: 'offline', reach: null });
    expect(media.link).not.toHaveBeenCalled();
  });

  it('retries a transient failure and asks again on the next mount', async () => {
    media.link.mockRejectedValue(new Error('network'));
    await mountTile(STREAMABLE);
    expect(media.link).toHaveBeenCalledTimes(2);
    await mountTile(STREAMABLE);
    expect(media.link).toHaveBeenCalledTimes(4);
  });
});
