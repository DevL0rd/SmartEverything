import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConnection } from './storage';

const CONNECTION: ServerConnection = {
  url: 'https://home.example.com',
  token: `set_${'a'.repeat(64)}`,
};
let activation: Promise<void> = Promise.resolve();
const tracked: Promise<void>[] = [];

vi.mock('../../design/platform', () => ({
  appPlatform: (): string => 'android',
  desktopBridge: (): null => null,
}));
vi.mock('./storage', () => ({
  desktopConnection: vi.fn(),
  forgetConnection: vi.fn(),
  prefersRemoteServer: (): boolean => false,
  preferRemoteServer: vi.fn(),
  readStoredConnection: (): Promise<ServerConnection> => Promise.resolve(CONNECTION),
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
});

describe('loading the saved connection', () => {
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
