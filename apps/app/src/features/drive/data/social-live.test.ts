import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { EntityStore } from '../../../store/entity-store';
import {
  CLIENT_ID,
  FOLDER_ID,
  ITEM_ID,
  MEMBER_ID,
  OTHER_ROW_ID,
  accessRequestRow,
  fileRequestRow,
  notificationRow,
  offlineRow,
  tableChange,
  transferRow,
} from './fixtures';
import { applyDriveChanges } from './live';
import { DRIVE_NOTICE_HANDLERS } from './notices';

const COMMENTS = driveKey('comments', DRIVE_EVERYWHERE, ITEM_ID);
const OTHER_COMMENTS = driveKey('comments', DRIVE_EVERYWHERE, FOLDER_ID);
const ITEM = driveKey('item', { rootId: null, folderId: null, albumId: null }, ITEM_ID);
const OTHER_ITEM = driveKey('item', { rootId: null, folderId: null, albumId: null }, FOLDER_ID);
const SUGGESTED = driveKey('suggested', DRIVE_EVERYWHERE);
const NOTIFICATIONS = driveKey('notifications', DRIVE_EVERYWHERE);
const ACCESS = driveKey('access-requests', DRIVE_EVERYWHERE, 'waiting');
const OPEN_ITEM = driveKey('open-item', DRIVE_EVERYWHERE, ITEM_ID);
const FILE_REQUESTS = driveKey('file-requests', DRIVE_EVERYWHERE, null);
const UPLOADS = driveKey('file-request-uploads', DRIVE_EVERYWHERE, ITEM_ID);
const TRANSFERS = driveKey('transfers', DRIVE_EVERYWHERE);
const OFFLINE = driveKey('offline', DRIVE_EVERYWHERE, CLIENT_ID);
const STATS = driveKey('stats', DRIVE_EVERYWHERE);

const ALL = [
  COMMENTS,
  OTHER_COMMENTS,
  ITEM,
  OTHER_ITEM,
  SUGGESTED,
  NOTIFICATIONS,
  ACCESS,
  OPEN_ITEM,
  FILE_REQUESTS,
  UPLOADS,
  TRANSFERS,
  OFFLINE,
  STATS,
];

function seeded(): QueryClient {
  const client = new QueryClient();
  for (const key of ALL) client.setQueryData(key, 'data');
  return client;
}

function staleKeys(client: QueryClient): readonly (readonly unknown[])[] {
  return ALL.filter((key) => client.getQueryState(key)?.isInvalidated === true);
}

function receive(
  client: QueryClient,
  message:
    | { readonly type: 'drive_comments_changed'; readonly itemId: string }
    | { readonly type: 'drive_notification'; readonly profileId: string },
): void {
  const context = { client, store: new EntityStore(), live: true };
  for (const handler of DRIVE_NOTICE_HANDLERS) handler.receive(message, context);
}

describe('drive social live changes', () => {
  it('refetches the comments and the item of a commented file and the lists that show the count', () => {
    const client = seeded();
    receive(client, { type: 'drive_comments_changed', itemId: ITEM_ID });
    expect(staleKeys(client)).toEqual([COMMENTS, ITEM, SUGGESTED]);
  });

  it('refetches only the inbox pages when a notification arrives', () => {
    const client = seeded();
    receive(client, { type: 'drive_notification', profileId: MEMBER_ID });
    expect(staleKeys(client)).toEqual([NOTIFICATIONS]);
  });

  it('refetches the request windows when an access request moves', () => {
    const client = seeded();
    applyDriveChanges(client, [
      tableChange('drive_access_requests', 'INSERT', accessRequestRow(), 1),
    ]);
    expect(staleKeys(client)).toEqual([ACCESS, OPEN_ITEM]);
  });

  it('refetches the file request windows and their uploads when a request moves', () => {
    const client = seeded();
    applyDriveChanges(client, [tableChange('drive_file_requests', 'UPDATE', fileRequestRow(), 2)]);
    expect(staleKeys(client)).toEqual([FILE_REQUESTS, UPLOADS]);
  });

  it('refetches only the offers while a transfer is offered or declined', () => {
    const client = seeded();
    applyDriveChanges(client, [tableChange('drive_transfers', 'INSERT', transferRow(), 3)]);
    expect(staleKeys(client)).toEqual([TRANSFERS]);
  });

  it('refetches every drive window when a transfer is accepted because the item changed hands', () => {
    const client = seeded();
    const accepted = transferRow({
      id: OTHER_ROW_ID,
      state: 'accepted',
      answeredAt: '2026-11-07T11:00:00.000Z',
    });
    applyDriveChanges(client, [tableChange('drive_transfers', 'UPDATE', accepted, 4)]);
    expect(staleKeys(client)).toEqual(ALL);
  });

  it('refetches the offline windows when a phone pin moves and ignores the inbox rows themselves', () => {
    const client = seeded();
    applyDriveChanges(client, [
      tableChange('drive_offline_items', 'UPDATE', offlineRow(), 5),
      tableChange('drive_notifications', 'INSERT', notificationRow(), 6),
    ]);
    expect(staleKeys(client)).toEqual([OFFLINE]);
  });
});
