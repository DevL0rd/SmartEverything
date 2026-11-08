import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPlatform } from '../../design/platform';
import type { ServerConnection, StoredKind } from './storage';

const CONNECTION: ServerConnection = {
  url: 'https://home.example.com',
  token: `set_${'a'.repeat(64)}`,
};
let activation: Promise<void> = Promise.resolve();
const tracked: Promise<void>[] = [];
let platform: AppPlatform = 'android';
const read = vi.fn<(_: StoredKind) => Promise<ServerConnection>>();

vi.mock('../../design/platform', () => ({
  appPlatform: (): AppPlatform => platform,
}));
vi.mock('./storage', () => ({
  forgetConnection: vi.fn(),
  readStoredConnection: (kind: StoredKind): Promise<ServerConnection> => read(kind),
}));
vi.mock('./dev-server', () => ({ devServerUrl: (): null => null }));
vi.mock('./client', () => ({ ApiClient: vi.fn() }));
vi.mock('./active-route', () => ({ routeFor: vi.fn(), stopHubRoute: vi.fn() }));
vi.mock('./route-platform', () => ({
  trackNativeActivation: (task: Promise<void>): void => {
    tracked.push(task);
  },
}));
vi.mock('./trust-storage', () => ({ forgetHubTrust: vi.fn() }));
vi.mock('./pairing-session', () => ({
  cancelPairingSession: (): Promise<void> => Promise.resolve(),
}));
vi.mock('../../../modules/health-connect/src/hub-network', () => ({
  activateNativeServerEnrollment: (): Promise<void> => activation,
  clearNativeServerCredential: vi.fn(),
}));

const { connectionState, loadConnection } = await import('./connection');

beforeEach(() => {
  tracked.length = 0;
  activation = Promise.resolve();
  platform = 'android';
  read.mockReset().mockResolvedValue(CONNECTION);
});

describe('loading the saved connection', () => {
  it.each([
    ['desktop', 'desktop'],
    ['web', 'browser'],
    ['android', 'phone'],
  ] as const)('uses the %s app’s own stored Hub connection', async (form, kind) => {
    platform = form;
    await loadConnection();
    expect(read).toHaveBeenCalledWith(kind);
    expect(connectionState.get()).toMatchObject({ status: 'paired', kind });
  });

  it('shows the paired state without waiting for the native activation', async () => {
    activation = new Promise<void>(() => undefined);
    await loadConnection();
    expect(connectionState.get()).toMatchObject({ status: 'paired', kind: 'phone' });
    expect(tracked).toEqual([activation]);
  });

  it('keeps the paired state when the native activation fails', async () => {
    activation = Promise.reject(new Error('keystore locked'));
    await loadConnection();
    expect(connectionState.get()).toMatchObject({ status: 'paired' });
    await expect(tracked[0]).rejects.toThrow('keystore locked');
  });
});
