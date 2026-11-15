import type { DriveOfflineSet } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { offlineRow } from '../data/fixtures';

vi.mock('../../../../modules/health-connect', () => ({
  clearDriveOffline: vi.fn(),
  configureDriveDocuments: vi.fn(),
  driveDocumentsLinked: (): boolean => true,
  driveOfflineStatus: vi.fn(),
  forgetDriveDocuments: vi.fn(),
  notifyDriveDocumentsChanged: vi.fn(),
  syncDriveOffline: vi.fn(),
}));
vi.mock('../../../api/drive', () => ({ setDriveOffline: vi.fn() }));
vi.mock('../../../store/selectors', () => ({ useSession: vi.fn(), useSyncStatus: vi.fn() }));
vi.mock('../data', () => ({ useDriveOfflineRows: vi.fn(), useOfflineSet: vi.fn() }));

import { offlineBody, offlineRowOf, pinnedRowsOf, removeAllOffline } from './offline';
import type { DriveProviderLink } from './provider';

const MINE = '5d7b1d8e-6a43-4c1c-8d1f-2a9b3c4d5e6f';
const OTHER = '6e8c2e9f-7b54-4d2d-9e20-3b0c4d5e6f70';
const FIRST = 'a6a1c6f0-1c6b-4a5e-8a54-1f5d7f1f2a01';
const SECOND = 'b7b2d7a1-2d7c-4b6f-9b65-2a6e8a2a3b02';

const rows = [
  offlineRow({ clientId: MINE, itemId: FIRST }),
  offlineRow({ clientId: MINE, itemId: SECOND }),
  offlineRow({ clientId: OTHER, itemId: FIRST }),
];

describe('offline pins of this phone', () => {
  it('finds the row of one item for this phone only', () => {
    expect(offlineRowOf(rows, MINE, FIRST)?.clientId).toBe(MINE);
    expect(offlineRowOf(rows, OTHER, SECOND)).toBeNull();
  });

  it('lists only this phone’s pins', () => {
    expect(pinnedRowsOf(rows, MINE).map((row) => row.itemId)).toEqual([FIRST, SECOND]);
  });

  it('builds the Hub body for a pin and an unpin', () => {
    expect(offlineBody(MINE, FIRST, true)).toEqual({ clientId: MINE, itemId: FIRST, on: true });
    expect(offlineBody(MINE, FIRST, false).on).toBe(false);
  });
});

describe('removeAllOffline', () => {
  it('unpins every pin of this phone through the Hub and then empties the phone', async () => {
    const order: string[] = [];
    const link: DriveProviderLink = {
      linked: () => true,
      configure: () => Promise.resolve(),
      forget: () => Promise.resolve(),
      notifyChanged: () => Promise.resolve(),
      offlineStatus: () => Promise.resolve({ usedBytes: 0, files: 0, pins: 0 }),
      offlineSync: () => Promise.resolve(),
      offlineClear: (): Promise<void> => {
        order.push('clear');
        return Promise.resolve();
      },
    };
    const unpin = (body: DriveOfflineSet): Promise<void> => {
      order.push(`${body.itemId}:${String(body.on)}`);
      return Promise.resolve();
    };
    expect(await removeAllOffline(link, rows, MINE, unpin)).toBe(2);
    expect(order).toEqual([`${FIRST}:false`, `${SECOND}:false`, 'clear']);
  });
});
