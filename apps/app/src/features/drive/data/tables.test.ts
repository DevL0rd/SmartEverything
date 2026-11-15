import { describe, expect, it } from 'vitest';
import type { NextTable } from '../../../store/state';
import { DRIVE_TABLE_RULES, driveTablesOf } from '../../../store/drive-tables';
import {
  accessRequestRow,
  albumRow,
  fileRequestRow,
  notificationRow,
  offlineRow,
  personalRootRow,
  rootRow,
  transferRow,
  CLIENT_ID,
  ITEM_ID,
  MEMBER_ID,
  OTHER_ROW_ID,
  OWNER_ID,
  ROOT_ID,
  OTHER_ROOT_ID,
  ROW_ID,
} from './fixtures';
import {
  offeredTransfers,
  offlineItemsOf,
  unreadNotificationCount,
  waitingAccessRequests,
} from './tables';

describe('drive table rules', () => {
  it('keys rows by id and orders personal drives before the Shared Drive', () => {
    const shared = rootRow(ROOT_ID, 'ready');
    const own = personalRootRow(OTHER_ROOT_ID, OWNER_ID);
    expect(DRIVE_TABLE_RULES.drive_roots.idOf(shared)).toBe(ROOT_ID);
    expect([shared, own].sort(DRIVE_TABLE_RULES.drive_roots.order).map((row) => row.scope)).toEqual(
      ['person', 'home'],
    );
    const album = albumRow(ROOT_ID);
    expect(DRIVE_TABLE_RULES.drive_albums.idOf(album)).toBe(album.id);
  });

  it('builds every drive table from the snapshot, empty when absent', () => {
    const calls: string[] = [];
    const next: NextTable = (name, rows) => {
      calls.push(`${name}:${String(rows.length)}`);
      return { byId: {}, ids: [], rows: [], version: 0 };
    };
    const root = rootRow(ROOT_ID, 'ready');
    driveTablesOf({ drive_roots: [root] }, next);
    expect(calls).toEqual([
      'drive_roots:1',
      'drive_albums:0',
      'drive_grants:0',
      'drive_placements:0',
      'drive_notifications:0',
      'drive_access_requests:0',
      'drive_file_requests:0',
      'drive_transfers:0',
      'drive_offline_items:0',
    ]);
  });

  it('orders the inbox, requests and offers newest first and keys offline rows by phone and item', () => {
    const older = notificationRow({ id: ROW_ID, updatedAt: '2026-11-07T10:00:00.000Z' });
    const newer = notificationRow({ id: OTHER_ROW_ID, updatedAt: '2026-11-08T10:00:00.000Z' });
    expect(
      [older, newer].sort(DRIVE_TABLE_RULES.drive_notifications.order).map((row) => row.id),
    ).toEqual([OTHER_ROW_ID, ROW_ID]);
    const request = accessRequestRow({ createdAt: '2026-11-08T10:00:00.000Z' });
    const earlier = accessRequestRow({ id: OTHER_ROW_ID });
    expect(
      [earlier, request].sort(DRIVE_TABLE_RULES.drive_access_requests.order).map((row) => row.id),
    ).toEqual([ROW_ID, OTHER_ROW_ID]);
    expect(DRIVE_TABLE_RULES.drive_file_requests.idOf(fileRequestRow())).toBe(ROW_ID);
    expect(DRIVE_TABLE_RULES.drive_transfers.idOf(transferRow())).toBe(ROW_ID);
    expect(DRIVE_TABLE_RULES.drive_offline_items.idOf(offlineRow())).toBe(
      `${CLIENT_ID}:${ITEM_ID}`,
    );
  });
});

describe('drive table selectors', () => {
  it('counts only unread notifications', () => {
    const rows = [
      notificationRow(),
      notificationRow({ id: OTHER_ROW_ID, readAt: '2026-11-07T11:00:00.000Z' }),
    ];
    expect(unreadNotificationCount(rows)).toBe(1);
    expect(unreadNotificationCount([])).toBe(0);
  });

  it('keeps the pending requests that wait for the viewer', () => {
    const rows = [
      accessRequestRow(),
      accessRequestRow({ id: OTHER_ROW_ID, ownerProfileId: MEMBER_ID }),
      accessRequestRow({
        id: 'a1b2c3d4-0000-4000-8000-000000000202',
        state: 'declined',
        answeredBy: OWNER_ID,
        answeredAt: '2026-11-07T11:00:00.000Z',
      }),
    ];
    expect(waitingAccessRequests(rows, OWNER_ID).map((row) => row.id)).toEqual([ROW_ID]);
    expect(waitingAccessRequests(rows, null)).toEqual([]);
  });

  it('keeps the open offers addressed to the viewer', () => {
    const rows = [
      transferRow(),
      transferRow({
        id: OTHER_ROW_ID,
        state: 'accepted',
        answeredAt: '2026-11-07T11:00:00.000Z',
      }),
    ];
    expect(offeredTransfers(rows, MEMBER_ID).map((row) => row.id)).toEqual([ROW_ID]);
    expect(offeredTransfers(rows, OWNER_ID)).toEqual([]);
  });

  it('maps one phone offline rows by item', () => {
    const other = offlineRow({ clientId: 'a1b2c3d4-0000-4000-8000-000000000021' });
    const mine = offlineRow();
    const map = offlineItemsOf([mine, other], CLIENT_ID);
    expect([...map.keys()]).toEqual([ITEM_ID]);
    expect(map.get(ITEM_ID)).toBe(mine);
  });
});
