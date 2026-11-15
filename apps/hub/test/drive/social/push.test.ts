import type { ClientPrefRead, DriveNotification } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveComments } from '../../../src/drive/social/comments';
import { NOTIFICATION_WORDING } from '../../../src/drive/social/notification-wording';
import {
  driveAudience,
  driveNotificationNames,
  drivePush,
  newDriveNotification,
  type PushKindsPref,
} from '../../../src/drive/social/notify-push';
import { testLogger } from '../../support/logs';
import { TRIP, TRIP_FILE, openSocial, share, type Social } from './social-fixture';

let social: Social;
let comments: DriveComments;
let created: DriveNotification[];
let stop: () => void;

beforeEach(async () => {
  social = await openSocial();
  share(social, TRIP, social.robin, 'view');
  share(social, TRIP, social.kim, 'edit');
  comments = new DriveComments({ store: social.opened.store, read: social.read });
  created = [];
  stop = social.opened.store.feed.subscribe((change) => {
    const row = newDriveNotification(change);
    if (row !== null) created.push(row);
  });
});

afterEach(async () => {
  stop();
  await social.opened.close();
});

describe('Drive push', () => {
  it('sees one new row per notification and none for a coalesced one', () => {
    comments.add(social.kim, TRIP_FILE, { body: 'a', parentId: null, mentions: [] });
    comments.add(social.kim, TRIP_FILE, { body: 'b', parentId: null, mentions: [] });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ kind: 'commented', profileId: social.sam.profileId });
  });

  it('words the push with the person and the file and points at the item', () => {
    comments.add(social.kim, TRIP_FILE, { body: 'a', parentId: null, mentions: [] });
    const [row] = created;
    if (row === undefined) throw new Error('no notification was written');
    const push = drivePush(row, driveNotificationNames(social.opened.store, row));
    expect(push).toEqual({
      title: 'New comment',
      body: 'Kim commented on a.txt',
      data: {
        kind: 'drive_notification',
        notificationId: row.id,
        notificationKind: 'commented',
        target: 'item',
        itemId: TRIP_FILE,
        refId: row.refId,
      },
    });
  });

  it('has wording for every kind', () => {
    for (const wording of Object.values(NOTIFICATION_WORDING)) {
      expect(wording.body({ actor: 'Kim', item: 'a.txt' })).toContain('a.txt');
    }
  });

  it('reaches only the recipient’s clients whose pushKinds include the kind', () => {
    comments.add(social.kim, TRIP_FILE, { body: 'a', parentId: null, mentions: [] });
    const [row] = created;
    if (row === undefined) throw new Error('no notification was written');
    const prefs = new Map<string, ClientPrefRead<PushKindsPref>>([
      ['sam-all', { status: 'absent', value: { pushKinds: ['commented', 'edited'] } }],
      ['sam-none', { status: 'stored', value: { pushKinds: ['edited'] }, migrated: false }],
      ['sam-broken', { status: 'invalid', reason: 'unreadable' }],
      ['kim-all', { status: 'absent', value: { pushKinds: ['commented'] } }],
    ]);
    const audience = driveAudience(row, {
      profileOf: (clientId) =>
        clientId.startsWith('sam') ? social.sam.profileId : social.kim.profileId,
      pushKindsOf: (clientId) =>
        prefs.get(clientId) ?? { status: 'invalid', reason: 'unknown client' },
      log: testLogger('push'),
    });
    expect(audience('sam-all')).toBe(true);
    expect(audience('sam-none')).toBe(false);
    expect(audience('sam-broken')).toBe(true);
    expect(audience('kim-all')).toBe(false);
  });
});
