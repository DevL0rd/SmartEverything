import type { CommittedNotice, DriveNotification } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveEditNotices } from '../../../src/drive/social/edit-notices';
import { testLogger } from '../../support/logs';
import {
  ROBIN_FILE,
  ROBIN_DRIVE,
  SAM_DRIVE,
  SHARED_FILE,
  HOME,
  TRIP,
  TRIP_FILE,
  openSocial,
  share,
  type Social,
} from './social-fixture';

let social: Social;
let notices: DriveEditNotices;

beforeEach(async () => {
  social = await openSocial();
  share(social, TRIP, social.robin, 'view');
  share(social, TRIP, social.kim, 'edit');
  notices = new DriveEditNotices(social.opened.store, testLogger('edit-notices'));
});

afterEach(async () => {
  await social.opened.close();
});

function edit(
  rootId: string,
  itemId: string,
  actorProfileId: string | null,
  op: 'update' | 'rename' | 'move' | 'create' | 'trash' = 'update',
): CommittedNotice {
  const { store } = social.opened;
  store.driveFeed.append({
    rootId,
    itemId,
    op,
    rev: 1,
    actorProfileId,
    via: actorProfileId === null ? 'scan' : 'app',
    deviceId: null,
  });
  return {
    type: 'drive_changed',
    rootIds: [rootId],
    folderIds: [],
    albumIds: [],
    months: [],
    cursor: store.driveFeed.latestSeq(),
  };
}

function inbox(profileId: string): readonly DriveNotification[] {
  return social.opened.store.driveNotifications.list(profileId, null, 50).notifications;
}

describe('edited notifications', () => {
  it('tells the drive owner and every grantee except the editor', () => {
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.kim.profileId));
    expect(inbox(social.sam.profileId)).toMatchObject([
      { kind: 'edited', itemId: TRIP_FILE, actorProfileId: social.kim.profileId },
    ]);
    expect(inbox(social.robin.profileId)).toMatchObject([{ kind: 'edited', itemId: TRIP_FILE }]);
    expect(inbox(social.kim.profileId)).toHaveLength(0);
  });

  it('never tells the editor about their own edit even when they own the file', () => {
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.sam.profileId));
    expect(inbox(social.sam.profileId)).toHaveLength(0);
    expect(inbox(social.robin.profileId)).toHaveLength(1);
  });

  it('coalesces repeated edits by the same person while unread and splits editors', () => {
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.kim.profileId));
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.kim.profileId));
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.sam.profileId));
    const rows = inbox(social.robin.profileId);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.actorProfileId === social.kim.profileId)?.count).toBe(2);
  });

  it('starts a new row after the earlier one was read', () => {
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.kim.profileId));
    social.opened.store.driveNotifications.markRead(social.robin.profileId, { all: true });
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.kim.profileId));
    expect(inbox(social.robin.profileId)).toHaveLength(2);
  });

  it('does not notify for the Shared Drive, for scans, or for changes that are not edits', () => {
    notices.noticed(edit(HOME, SHARED_FILE, social.kim.profileId));
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, null));
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.kim.profileId, 'create'));
    notices.noticed(edit(SAM_DRIVE, TRIP_FILE, social.kim.profileId, 'trash'));
    expect(inbox(social.robin.profileId)).toHaveLength(0);
    expect(inbox(social.sam.profileId)).toHaveLength(0);
  });

  it('does not notify people with no access to the item', () => {
    notices.noticed(edit(ROBIN_DRIVE, ROBIN_FILE, social.robin.profileId));
    expect(inbox(social.sam.profileId)).toHaveLength(0);
    expect(inbox(social.kim.profileId)).toHaveLength(0);
  });

  it('ignores changes written before it started and reads each row once', () => {
    const before = edit(SAM_DRIVE, TRIP_FILE, social.kim.profileId);
    const late = new DriveEditNotices(social.opened.store, testLogger('late'));
    late.noticed(before);
    expect(inbox(social.robin.profileId)).toHaveLength(0);
    notices.noticed(before);
    notices.noticed(before);
    expect(inbox(social.robin.profileId)[0]?.count).toBe(1);
  });

  it('listens to the change feed once started', () => {
    const stop = notices.start();
    const { store } = social.opened;
    store.driveFeed.append({
      rootId: SAM_DRIVE,
      itemId: TRIP_FILE,
      op: 'update',
      rev: 2,
      actorProfileId: social.kim.profileId,
      via: 'app',
      deviceId: null,
    });
    store.feed.notice({
      type: 'drive_changed',
      rootIds: [SAM_DRIVE],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: store.driveFeed.latestSeq(),
    });
    stop();
    expect(inbox(social.robin.profileId)).toHaveLength(1);
  });
});
