import { describe, expect, it } from 'vitest';
import { DRIVE_SHARE, type DriveShare } from '@smarteverything/domain';
import { DAY_MS } from '../../../format/time';
import { ROOT_ID, rootRow } from '../../nas/data/fixtures';
import { linkGroupsOf } from '../shared/shared-model';
import {
  END_OPTIONS,
  NEW_DRAFT,
  accessOptionsOf,
  audienceOf,
  draftReady,
  expiryOf,
  itemLinkStatsOf,
  mayMakeLinks,
  reachOf,
  shareRequestOf,
} from './share-model';

const ITEM_ID = 'a1b2c3d4-0000-4000-8000-000000000201';
const ME = 'a1b2c3d4-0000-4000-8000-000000000301';
const SAM = 'a1b2c3d4-0000-4000-8000-000000000302';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');

const PEOPLE = [
  { id: ME, name: 'Dana Moss' },
  { id: SAM, name: 'Sam Moss' },
];

function share(fields: Partial<DriveShare>): DriveShare {
  return DRIVE_SHARE.parse({
    id: 'a1b2c3d4-0000-4000-8000-000000000401',
    itemId: ITEM_ID,
    permission: 'view',
    expiresAt: null,
    hasPassword: false,
    createdBy: ME,
    revokedAt: null,
    opens: 0,
    downloads: 0,
    lastOpenedAt: null,
    ...fields,
  });
}

describe('the share request mapping', () => {
  it('makes a view link with no end and no password from a new draft', () => {
    expect(shareRequestOf(ITEM_ID, NEW_DRAFT, NOW)).toEqual({
      itemId: ITEM_ID,
      permission: 'view',
      expiresAt: null,
      password: null,
    });
  });

  it('turns each end choice into a moment that many days ahead, and Never into none', () => {
    expect(END_OPTIONS.map((option) => option.label)).toEqual([
      '1 day',
      '7 days',
      '30 days',
      'Never',
    ]);
    expect(expiryOf('day', NOW)).toBe(new Date(NOW + DAY_MS).toISOString());
    expect(expiryOf('week', NOW)).toBe('2026-11-14T12:00:00.000Z');
    expect(expiryOf('month', NOW)).toBe('2026-12-07T12:00:00.000Z');
    expect(expiryOf('never', NOW)).toBeNull();
  });

  it('sends download access, the end and the typed password', () => {
    const draft = { permission: 'download', end: 'week', password: 'kitchen-2026' } as const;
    expect(shareRequestOf(ITEM_ID, draft, NOW)).toEqual({
      itemId: ITEM_ID,
      permission: 'download',
      expiresAt: '2026-11-14T12:00:00.000Z',
      password: 'kitchen-2026',
    });
  });

  it('makes nothing while the password switch is on and the password is empty', () => {
    const draft = { ...NEW_DRAFT, password: '' };
    expect(draftReady(draft)).toBe(false);
    expect(shareRequestOf(ITEM_ID, draft, NOW)).toBeNull();
    expect(draftReady(NEW_DRAFT)).toBe(true);
  });
});

describe('the share sheet copy', () => {
  it('labels access the same as the links table, shortened on the phone', () => {
    expect(accessOptionsOf(false).map((option) => option.label)).toEqual([
      'View',
      'View and download',
    ]);
    const narrow = accessOptionsOf(true);
    expect(narrow.map((option) => option.label)).toEqual(['View', 'Download']);
    expect(narrow[1]?.spoken).toBe('View and download');
  });

  it('says everyone in the home sees a home library folder, with the right verb', () => {
    const root = rootRow(ROOT_ID, 'ready');
    expect(audienceOf(root, PEOPLE, ME)).toEqual({
      people: PEOPLE,
      line: 'Everyone in the home can edit',
      from: 'from Photos',
    });
    expect(audienceOf({ ...root, readOnly: true }, PEOPLE, ME).line).toBe(
      'Everyone in the home can view',
    );
  });

  it('says only the owner sees a person’s own files', () => {
    const own = { ...rootRow(ROOT_ID, 'ready'), scope: 'person', ownerProfileId: SAM } as const;
    expect(audienceOf(own, PEOPLE, SAM)).toEqual({
      people: [PEOPLE[1]],
      line: 'Only you can open it',
      from: 'from Photos',
    });
    expect(audienceOf(own, PEOPLE, ME).line).toBe('Only Sam Moss can open it');
  });

  it('lets the owner make links, and members only when the owner allows it', () => {
    expect(mayMakeLinks(true, null)).toBe(true);
    expect(mayMakeLinks(false, null)).toBe(false);
    expect(mayMakeLinks(false, { membersMayShare: false })).toBe(false);
    expect(mayMakeLinks(false, { membersMayShare: true })).toBe(true);
  });

  it('says when a link opens only on the home network', () => {
    expect(reachOf(true)).toBe('Anyone with the link can open it.');
    expect(reachOf(false)).toContain('only on your home network');
  });
});

describe('the item link stats', () => {
  it('counts active links and every open and download, ended links included', () => {
    const groups = linkGroupsOf(
      [
        share({ opens: 4, downloads: 1 }),
        share({
          id: 'a1b2c3d4-0000-4000-8000-000000000402',
          opens: 2,
          downloads: 2,
          revokedAt: '2026-11-01T09:00:00.000Z',
        }),
      ],
      NOW,
    );
    expect(itemLinkStatsOf(groups).map((item) => [item.label, item.value])).toEqual([
      ['Active links', '1'],
      ['Opens', '6'],
      ['Downloads', '3'],
    ]);
  });
});
