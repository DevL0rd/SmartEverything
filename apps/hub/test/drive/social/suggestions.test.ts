import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveComments } from '../../../src/drive/social/comments';
import { DriveSuggestions } from '../../../src/drive/social/suggestions';
import {
  HOME,
  ROBIN_DRIVE,
  ROBIN_FILE,
  SAM_DRIVE,
  SECRET,
  SHARED_FILE,
  TRIP,
  TRIP_FILE,
  openSocial,
  share,
  type Social,
} from './social-fixture';

let social: Social;
let suggestions: DriveSuggestions;

beforeEach(async () => {
  social = await openSocial();
  suggestions = new DriveSuggestions(social.opened.store);
});

afterEach(async () => {
  await social.opened.close();
});

function feed(rootId: string, itemId: string, actor: string | null, at: string): void {
  const { store } = social.opened;
  store.database.exec('pragma foreign_keys = off');
  store.database
    .prepare(
      `insert into drive_feed (root_id, item_id, op, rev, at, actor_profile_id, via, device_id)
        values (?, ?, 'update', 1, ?, ?, 'app', null)`,
    )
    .run(rootId, itemId, at, actor);
  store.database.exec('pragma foreign_keys = on');
}

async function listed(): Promise<{ id: string; reason: string }[]> {
  return (await suggestions.list(social.robin, undefined)).items.map((entry) => ({
    id: entry.item.id,
    reason: entry.reason,
  }));
}

describe('suggested files', () => {
  it('ranks by the newest signal with the reason of that signal', async () => {
    const { store } = social.opened;
    share(social, TRIP, social.robin, 'view');
    store.driveOpens.record(social.robin.profileId, ROBIN_FILE, '2026-11-09T00:00:00.000Z');
    feed(SAM_DRIVE, TRIP_FILE, social.sam.profileId, '2026-11-10T00:00:00.000Z');
    expect(await listed()).toEqual([
      { id: TRIP_FILE, reason: 'edited_by' },
      { id: ROBIN_FILE, reason: 'opened' },
      { id: TRIP, reason: 'shared' },
    ]);
  });

  it('names an edit by the viewer as edited and one by another person as edited_by', async () => {
    feed(ROBIN_DRIVE, ROBIN_FILE, social.robin.profileId, '2026-11-09T00:00:00.000Z');
    expect(await listed()).toEqual([{ id: ROBIN_FILE, reason: 'edited' }]);
    feed(ROBIN_DRIVE, ROBIN_FILE, social.sam.profileId, '2026-11-10T00:00:00.000Z');
    expect(await listed()).toEqual([{ id: ROBIN_FILE, reason: 'edited_by' }]);
  });

  it('lists one entry per item and carries the person behind the reason', async () => {
    const { store } = social.opened;
    share(social, TRIP, social.robin, 'edit');
    store.driveOpens.record(social.robin.profileId, TRIP, '2026-11-12T00:00:00.000Z');
    const page = await suggestions.list(social.robin, undefined);
    expect(page.items.filter((entry) => entry.item.id === TRIP)).toHaveLength(1);
    share(social, TRIP, social.kim, 'edit');
    const comments = new DriveComments({ store });
    await comments.add(social.kim, TRIP_FILE, {
      body: 'hi',
      parentId: null,
      mentions: [social.robin.profileId],
    });
    const mention = (await suggestions.list(social.robin, undefined)).items.find(
      (entry) => entry.item.id === TRIP_FILE,
    );
    expect(mention).toMatchObject({ reason: 'mentioned', actorProfileId: social.kim.profileId });
  });

  it('does not suggest edits of the Shared Drive by others but does the viewer’s own', async () => {
    feed(HOME, SHARED_FILE, social.sam.profileId, '2026-11-10T00:00:00.000Z');
    expect(await listed()).toEqual([]);
    feed(HOME, SHARED_FILE, social.robin.profileId, '2026-11-11T00:00:00.000Z');
    expect(await listed()).toEqual([{ id: SHARED_FILE, reason: 'edited' }]);
  });

  it('never suggests what the viewer cannot open', async () => {
    const { store } = social.opened;
    store.driveOpens.record(social.sam.profileId, SECRET, '2026-11-10T00:00:00.000Z');
    feed(SAM_DRIVE, SECRET, social.sam.profileId, '2026-11-10T00:00:00.000Z');
    expect(await listed()).toEqual([]);
  });

  it('pages through every suggestion without repeats', async () => {
    const { store } = social.opened;
    store.driveOpens.record(social.robin.profileId, ROBIN_FILE, '2026-11-09T00:00:00.000Z');
    store.driveOpens.record(social.robin.profileId, SHARED_FILE, '2026-11-08T00:00:00.000Z');
    const page = await suggestions.list(social.robin, undefined);
    expect(page.next).toBeNull();
    expect(page.items.map((entry) => entry.item.id)).toEqual([ROBIN_FILE, SHARED_FILE]);
  });
});
