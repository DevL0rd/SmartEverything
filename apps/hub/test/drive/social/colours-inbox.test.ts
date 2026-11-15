import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveFolderColours } from '../../../src/drive/social/folder-colours';
import { DriveInbox } from '../../../src/drive/social/notifications';
import {
  ROBIN_FILE,
  ROBIN_FOLDER,
  TRIP,
  TRIP_FILE,
  openSocial,
  share,
  type Social,
} from './social-fixture';

let social: Social;
let colours: DriveFolderColours;

beforeEach(async () => {
  social = await openSocial();
  colours = new DriveFolderColours({ store: social.opened.store, read: social.read });
});

afterEach(async () => {
  await social.opened.close();
});

describe('folder colours', () => {
  it('colours a folder for the viewer only', () => {
    share(social, TRIP, social.robin, 'view');
    expect(colours.set(social.robin, { itemId: TRIP, colour: 'viz-3' })).toMatchObject({
      colour: 'viz-3',
    });
    expect(social.opened.store.driveItems.byId(TRIP, social.sam.profileId)).toMatchObject({
      colour: null,
    });
    expect(social.opened.store.driveItems.byId(TRIP, social.robin.profileId)).toMatchObject({
      colour: 'viz-3',
    });
  });

  it('clears a colour and refuses files and folders the viewer cannot open', () => {
    colours.set(social.robin, { itemId: ROBIN_FOLDER, colour: 'viz-1' });
    expect(colours.set(social.robin, { itemId: ROBIN_FOLDER, colour: null })).toMatchObject({
      colour: null,
    });
    expect(() => colours.set(social.robin, { itemId: ROBIN_FILE, colour: 'viz-1' })).toThrow(
      /Only a folder/,
    );
    expect(() => colours.set(social.robin, { itemId: TRIP, colour: 'viz-1' })).toThrow(/no such/);
  });
});

describe('the Drive inbox', () => {
  it('lists newest first, pages, and marks read only the caller’s own rows', () => {
    const { store } = social.opened;
    for (const itemId of [TRIP, TRIP_FILE, ROBIN_FILE]) {
      store.driveNotifications.add({
        profileId: social.robin.profileId,
        kind: 'shared',
        itemId,
        actorProfileId: social.sam.profileId,
        actorName: null,
        refId: null,
      });
    }
    const other = store.driveNotifications.add({
      profileId: social.sam.profileId,
      kind: 'shared',
      itemId: TRIP,
      actorProfileId: social.robin.profileId,
      actorName: null,
      refId: null,
    }).notification;
    const inbox = new DriveInbox(store);
    const page = inbox.list(social.robin, undefined);
    expect(page.items).toHaveLength(3);
    inbox.markRead(social.robin, { ids: [other.id, page.items[0]?.id ?? ''] });
    expect(store.driveNotifications.unreadCount(social.robin.profileId)).toBe(2);
    expect(store.driveNotifications.unreadCount(social.sam.profileId)).toBe(1);
    inbox.markRead(social.robin, { all: true });
    expect(store.driveNotifications.unreadCount(social.robin.profileId)).toBe(0);
  });
});
