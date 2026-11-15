import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../modules/health-connect', () => ({
  clearDriveOffline: vi.fn(),
  configureDriveDocuments: vi.fn(),
  driveDocumentsLinked: (): boolean => true,
  driveOfflineStatus: vi.fn(),
  forgetDriveDocuments: vi.fn(),
  notifyDriveDocumentsChanged: vi.fn(),
  syncDriveOffline: vi.fn(),
}));
vi.mock('../../../store/selectors', () => ({ useSession: vi.fn(), useSyncStatus: vi.fn() }));

import { forwardDriveChange, type DriveProviderLink } from './provider';
import { pairDriveProvider } from './provider-sync';

const ROOT = 'a6a1c6f0-1c6b-4a5e-8a54-1f5d7f1f2a01';
const FOLDER = 'b7b2d7a1-2d7c-4b6f-9b65-2a6e8a2a3b02';
const CLIENT = '5d7b1d8e-6a43-4c1c-8d1f-2a9b3c4d5e6f';

function link(overrides: Partial<DriveProviderLink> = {}): DriveProviderLink & {
  readonly notified: (readonly [readonly string[], readonly string[]])[];
  readonly configured: string[];
} {
  const notified: (readonly [readonly string[], readonly string[]])[] = [];
  const configured: string[] = [];
  return {
    notified,
    configured,
    linked: () => true,
    configure: (clientId): Promise<void> => {
      configured.push(clientId);
      return Promise.resolve();
    },
    forget: () => Promise.resolve(),
    notifyChanged: (rootIds, folderIds): Promise<void> => {
      notified.push([rootIds, folderIds]);
      return Promise.resolve();
    },
    offlineStatus: () => Promise.resolve({ usedBytes: 0, files: 0, pins: 0 }),
    offlineSync: () => Promise.resolve(),
    offlineClear: () => Promise.resolve(),
    ...overrides,
  };
}

describe('forwardDriveChange', () => {
  it('passes the changed roots and folders to the Files app provider', async () => {
    const calls = link();
    expect(await forwardDriveChange(calls, { rootIds: [ROOT], folderIds: [FOLDER] })).toBe(true);
    expect(calls.notified).toEqual([[[ROOT], [FOLDER]]]);
  });

  it('does nothing when no folder or drive changed', async () => {
    const calls = link();
    expect(await forwardDriveChange(calls, { rootIds: [], folderIds: [] })).toBe(false);
    expect(calls.notified).toEqual([]);
  });

  it('does nothing on an app build without the provider', async () => {
    const calls = link({ linked: () => false });
    expect(await forwardDriveChange(calls, { rootIds: [ROOT], folderIds: [] })).toBe(false);
    expect(calls.notified).toEqual([]);
  });
});

describe('pairDriveProvider', () => {
  it('tells the provider which phone it serves', async () => {
    const calls = link();
    expect(await pairDriveProvider(calls, CLIENT)).toBe(true);
    expect(calls.configured).toEqual([CLIENT]);
  });

  it('reports false instead of throwing when the native side refuses', async () => {
    const calls = link({ configure: () => Promise.reject(new Error('refused')) });
    expect(await pairDriveProvider(calls, CLIENT)).toBe(false);
  });

  it('skips an app build without the provider', async () => {
    const calls = link({ linked: () => false });
    expect(await pairDriveProvider(calls, CLIENT)).toBe(false);
    expect(calls.configured).toEqual([]);
  });
});
