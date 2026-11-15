import { describe, expect, it } from 'vitest';
import {
  ALBUM_ACTIVITY,
  PARTNER_SHARE,
  PHOTO_SHARING,
  type AlbumActivity,
  type PartnerShare,
} from '@smarteverything/domain';
import {
  activityLine,
  canAddPhotos,
  contributionsOf,
  feedOf,
  groupNamesOf,
  likedBy,
  likesOf,
  membersLine,
  nameOf,
  partnerScopeLine,
  partnerSidesOf,
  partnerStateLine,
  roleOf,
  sharingStateOf,
  unreadText,
} from './model';

const ME = 'a1b2c3d4-0000-4000-8000-000000000001';
const ANA = 'a1b2c3d4-0000-4000-8000-000000000002';
const BEN = 'a1b2c3d4-0000-4000-8000-000000000003';
const ALBUM = 'a1b2c3d4-0000-4000-8000-000000000010';
const GARDEN = 'a1b2c3d4-0000-4000-8000-000000000011';
const ITEM = 'a1b2c3d4-0000-4000-8000-000000000020';
const PEOPLE = [
  { id: ANA, name: 'Ana' },
  { id: BEN, name: 'Ben' },
];
const DAYS = { today: '2026-11-15', yesterday: '2026-11-14', timeZone: 'UTC' };

let serial = 0;

function activity(fields: Partial<AlbumActivity>): AlbumActivity {
  serial += 1;
  return ALBUM_ACTIVITY.parse({
    id: `a1b2c3d4-0000-4000-8000-${String(100 + serial).padStart(12, '0')}`,
    albumId: ALBUM,
    itemId: null,
    profileId: ANA,
    kind: 'like',
    text: null,
    createdAt: '2026-11-15T10:00:00Z',
    ...fields,
  });
}

function partner(fields: Partial<PartnerShare>): PartnerShare {
  return PARTNER_SHARE.parse({
    id: 'a1b2c3d4-0000-4000-8000-000000000030',
    sharerId: ME,
    recipientId: ANA,
    scope: 'all',
    groupIds: [],
    fromDay: '2026-01-01',
    state: 'offered',
    autoSave: false,
    createdAt: '2026-11-01T00:00:00Z',
    ...fields,
  });
}

describe('sharing model', () => {
  it('names people, the caller as You and unknown people as Someone', () => {
    expect(nameOf(ME, PEOPLE, ME)).toBe('You');
    expect(nameOf(ANA, PEOPLE, ME)).toBe('Ana');
    expect(nameOf('a1b2c3d4-0000-4000-8000-000000000099', PEOPLE, ME)).toBe('Someone');
    expect(
      groupNamesOf(
        ['g1', 'g2', 'g3'],
        [
          { id: 'g1', name: 'Mia' },
          { id: 'g2', name: 'Leo' },
        ],
      ),
    ).toBe('Mia, Leo and an unnamed person');
    expect(groupNamesOf([], [])).toBe('chosen people');
  });

  it('says what happened on the album or on one photo', () => {
    expect(activityLine(activity({ kind: 'like' }), 'Ana')).toBe('Ana liked the album');
    expect(activityLine(activity({ kind: 'like', itemId: ITEM }), 'Ana')).toBe('Ana liked a photo');
    expect(activityLine(activity({ kind: 'comment', text: 'Lovely' }), 'You')).toBe(
      'You commented',
    );
    expect(activityLine(activity({ kind: 'added', itemId: ITEM }), 'Ben')).toBe(
      'Ben added a photo',
    );
    expect(activityLine(activity({ kind: 'left' }), 'Ben')).toBe('Ben left');
  });

  it('groups the feed by album in feed order and by day inside each album', () => {
    const sharing = PHOTO_SHARING.parse({
      albums: [],
      partners: [],
      unread: 0,
      activity: [
        activity({ createdAt: '2026-11-15T09:00:00Z' }),
        activity({ albumId: GARDEN, createdAt: '2026-11-15T08:00:00Z' }),
        activity({ createdAt: '2026-11-14T09:00:00Z' }),
        activity({ createdAt: '2026-11-02T09:00:00Z' }),
      ],
    });
    const feed = feedOf(sharing, DAYS);
    expect(feed.map((album) => [album.albumId, album.title])).toEqual([
      [ALBUM, 'Shared album'],
      [GARDEN, 'Shared album'],
    ]);
    expect(feed[0]?.days.map((day) => [day.label, day.entries.length])).toEqual([
      ['Today', 1],
      ['Yesterday', 1],
      ['2 November 2026', 1],
    ]);
  });

  it('reads the page state from the data, the connection and failures', () => {
    const empty = PHOTO_SHARING.parse({ albums: [], partners: [], activity: [], unread: 0 });
    expect(sharingStateOf({ data: undefined, failed: false, live: true })).toBe('loading');
    expect(sharingStateOf({ data: undefined, failed: true, live: true })).toBe('error');
    expect(sharingStateOf({ data: undefined, failed: false, live: false })).toBe('offline');
    expect(sharingStateOf({ data: empty, failed: false, live: true })).toBe('empty');
    expect(
      sharingStateOf({ data: { ...empty, partners: [partner({})] }, failed: false, live: false }),
    ).toBe('ready');
  });

  it('splits partner shares into what the caller shares, is offered and receives', () => {
    const out = partner({ state: 'accepted' });
    const offered = partner({
      id: 'a1b2c3d4-0000-4000-8000-000000000031',
      sharerId: ANA,
      recipientId: ME,
    });
    const receiving = partner({
      id: 'a1b2c3d4-0000-4000-8000-000000000032',
      sharerId: BEN,
      recipientId: ME,
      state: 'accepted',
    });
    const stopped = partner({ id: 'a1b2c3d4-0000-4000-8000-000000000033', state: 'stopped' });
    expect(partnerSidesOf([out, offered, receiving, stopped], ME)).toEqual({
      outgoing: [out],
      offered: [offered],
      receiving: [receiving],
    });
    expect(partnerStateLine(out, ME)).toBe('Sharing now');
    expect(partnerStateLine(partner({}), ME)).toBe('Waiting for them to accept');
    expect(partnerStateLine(offered, ME)).toBe('Wants to share photos with you');
    expect(partnerScopeLine(out, '')).toBe('All photos from 1 January 2026');
    expect(partnerScopeLine(partner({ scope: 'people', groupIds: [ITEM] }), 'Mia')).toBe(
      'Photos of Mia from 1 January 2026',
    );
  });

  it('lets owners and contributors add photos and reads roles of albums not yet shared', () => {
    expect(canAddPhotos('owner')).toBe(true);
    expect(canAddPhotos('contributor')).toBe(true);
    expect(canAddPhotos('viewer')).toBe(false);
    expect(canAddPhotos(null)).toBe(false);
    expect(roleOf({ id: ALBUM, ownerProfileId: ME }, undefined, ME)).toBe('owner');
    expect(roleOf({ id: ALBUM, ownerProfileId: ANA }, undefined, ME)).toBeNull();
  });

  it('counts people, unread updates, likes and the caller’s own like', () => {
    expect(membersLine([])).toBe('Only you');
    expect(membersLine([ANA, BEN])).toBe('3 people');
    expect(unreadText(0)).toBeNull();
    expect(unreadText(4)).toBe('4 new');
    const mine = activity({ profileId: ME });
    const entries = [
      mine,
      activity({}),
      activity({ itemId: ITEM }),
      activity({ kind: 'comment', text: 'Hi' }),
    ];
    expect(likesOf(entries, null)).toBe(2);
    expect(likesOf(entries, ITEM)).toBe(1);
    expect(likedBy(entries, null, ME)).toBe(mine);
    expect(likedBy(entries, ITEM, ME)).toBeUndefined();
  });

  it('ranks the people who added photos by how many they added', () => {
    expect(
      contributionsOf([
        { addedByProfileId: ANA },
        { addedByProfileId: BEN },
        { addedByProfileId: BEN },
        { addedByProfileId: null },
      ]),
    ).toEqual([
      { profileId: BEN, items: 2 },
      { profileId: ANA, items: 1 },
    ]);
  });
});
