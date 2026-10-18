import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  getStatus: vi.fn(),
  requestAllPermissions: vi.fn(),
  healthConnectConfigured: vi.fn(),
  schedule: vi.fn(),
  configureServer: vi.fn(),
  cancelSchedule: vi.fn(),
}));
const createHealthSource = vi.hoisted(() => vi.fn());

vi.mock('../../../../modules/health-connect', () => ({
  ...native,
  addSyncProgressListener: vi.fn(),
  grantedPermissions: vi.fn(),
  isHealthConnectLinked: true,
  lastSync: vi.fn(),
  syncNow: vi.fn(),
}));
vi.mock('../../../api/health', () => ({ createHealthSource }));

import { connectPhone, grantedNothing } from './health-connect';

const SERVER = { url: 'https://hub.example', token: 'tok' };
const AVAILABLE = { sdk: 'available' };

beforeEach(() => {
  vi.clearAllMocks();
  native.getStatus.mockResolvedValue(AVAILABLE);
  native.healthConnectConfigured.mockResolvedValue(false);
  createHealthSource.mockResolvedValue({ client_id: 'c1' });
});

describe('grantedNothing', () => {
  it('is true only when neither reads nor writes were granted', () => {
    const base = { background: false, history: false };
    expect(grantedNothing({ ...base, types: [] })).toBe(true);
    expect(grantedNothing({ ...base, types: [], writeTypes: [] })).toBe(true);
    expect(grantedNothing({ ...base, types: ['Steps'] })).toBe(false);
    expect(grantedNothing({ ...base, types: [], writeTypes: ['Weight'] })).toBe(false);
  });
});

describe('connectPhone', () => {
  it('creates no source and schedules nothing when nothing was granted', async () => {
    native.requestAllPermissions.mockResolvedValue({
      types: [],
      writeTypes: [],
      background: false,
      history: false,
    });
    await connectPhone(SERVER, 'Phone', 15, false);
    expect(createHealthSource).not.toHaveBeenCalled();
    expect(native.schedule).not.toHaveBeenCalled();
  });

  it('creates the source and schedules sync once something was granted', async () => {
    native.requestAllPermissions.mockResolvedValue({
      types: ['Steps'],
      writeTypes: [],
      background: false,
      history: false,
    });
    await connectPhone(SERVER, 'Phone', 15, false);
    expect(createHealthSource).toHaveBeenCalledWith('Phone');
    expect(native.schedule).toHaveBeenCalledWith({ intervalMinutes: 15 });
  });

  it('hands the paired server url and token to the native side before registering', async () => {
    native.requestAllPermissions.mockResolvedValue({
      types: ['Steps'],
      writeTypes: [],
      background: false,
      history: false,
    });
    await connectPhone(SERVER, 'Phone', 15, false);
    expect(native.configureServer).toHaveBeenCalledWith('https://hub.example', 'tok');
    expect(native.configureServer.mock.invocationCallOrder[0]).toBeLessThan(
      createHealthSource.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('rejects with the native permission failure and sets nothing up', async () => {
    const failure = new Error('This app build does not declare 1 Health Connect permission(s)');
    native.requestAllPermissions.mockRejectedValue(failure);
    await expect(connectPhone(SERVER, 'Phone', 15, false)).rejects.toBe(failure);
    expect(native.configureServer).not.toHaveBeenCalled();
    expect(createHealthSource).not.toHaveBeenCalled();
    expect(native.schedule).not.toHaveBeenCalled();
  });

  it('configures nothing when nothing was granted', async () => {
    native.requestAllPermissions.mockResolvedValue({
      types: [],
      writeTypes: [],
      background: false,
      history: false,
    });
    await connectPhone(SERVER, 'Phone', 15, false);
    expect(native.configureServer).not.toHaveBeenCalled();
  });

  it('registers nothing again for a phone that already syncs', async () => {
    native.requestAllPermissions.mockResolvedValue({
      types: ['Steps'],
      writeTypes: [],
      background: false,
      history: false,
    });
    await connectPhone(SERVER, 'Phone', 15, true);
    expect(createHealthSource).not.toHaveBeenCalled();
    expect(native.schedule).toHaveBeenCalledWith({ intervalMinutes: 15 });
  });
});
