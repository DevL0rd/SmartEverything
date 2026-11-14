import { describe, expect, it } from 'vitest';
import { DRIVE_SHARE, type DriveShare } from '@smarteverything/domain';
import { DAY_MS } from '../../../format/time';
import { GRANT_ID, grantRow } from '../data/fixtures';
import { linkGroupsOf } from '../shared/shared-model';
import {
  END_OPTIONS,
  LINK_STATE_LINE,
  NEW_DRAFT,
  ROLE_OPTIONS,
  accessOptionsOf,
  candidatesOf,
  draftReady,
  expiryOf,
  footerLineOf,
  itemLinkStatsOf,
  linkStateOf,
  peopleModeOf,
  reachOf,
  shareRequestOf,
  shareTitleOf,
  sharedPeopleOf,
} from './share-model';

const ITEM_ID = 'a1b2c3d4-0000-4000-8000-000000000201';
const ME = 'a1b2c3d4-0000-4000-8000-000000000301';
const SAM = 'a1b2c3d4-0000-4000-8000-000000000302';
const ROBIN = 'a1b2c3d4-0000-4000-8000-000000000303';
const GONE = 'a1b2c3d4-0000-4000-8000-000000000304';
const OTHER_ITEM_ID = 'a1b2c3d4-0000-4000-8000-000000000202';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');

const PEOPLE = [
  { id: ME, name: 'Dana Moss' },
  { id: SAM, name: 'Sam Moss' },
  { id: ROBIN, name: 'Robin Moss' },
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

  it('titles the sheet with the item name in quotes', () => {
    expect(shareTitleOf({ name: 'Taxes 2026' })).toBe('Share ‘Taxes 2026’');
  });

  it('lets only the drive’s person manage people, and shows everyone on the Shared Drive', () => {
    expect(peopleModeOf('own')).toBe('manage');
    expect(peopleModeOf('shared')).toBe('everyone');
    expect(peopleModeOf('edit')).toBe('owner-only');
    expect(peopleModeOf('view')).toBe('owner-only');
    expect(peopleModeOf('none')).toBe('owner-only');
  });

  it('says who can open the item under the sheet', () => {
    expect(footerLineOf('own', null)).toBe('Only you and the people above can open this');
    expect(footerLineOf('shared', null)).toBe(
      'Everyone in the home can already open this; you can still make a link',
    );
    expect(footerLineOf('edit', 'Sam Moss')).toBe(
      'Only Sam Moss and the people above can open this',
    );
  });

  it('offers Can view and Can edit as the roles', () => {
    expect(ROLE_OPTIONS.map((option) => [option.value, option.label])).toEqual([
      ['view', 'Can view'],
      ['edit', 'Can edit'],
    ]);
  });

  it('lists the people of this item only and offers everyone else but the drive’s person', () => {
    const grants = [
      grantRow(GRANT_ID, ITEM_ID, SAM, 'edit'),
      grantRow('a1b2c3d4-0000-4000-8000-000000000013', OTHER_ITEM_ID, ROBIN, 'view'),
    ];
    const people = sharedPeopleOf(grants, ITEM_ID, PEOPLE, ME);
    expect(people.map((person) => [person.name, person.grant.role])).toEqual([
      ['Sam Moss', 'edit'],
    ]);
    expect(candidatesOf(PEOPLE, people, ME).map((person) => person.name)).toEqual(['Robin Moss']);
  });

  it('names a grant of a removed person and the viewer’s own grant', () => {
    const grants = [
      grantRow(GRANT_ID, ITEM_ID, ME, 'view'),
      grantRow('a1b2c3d4-0000-4000-8000-000000000013', ITEM_ID, GONE, 'view'),
    ];
    expect(sharedPeopleOf(grants, ITEM_ID, PEOPLE, ME).map((person) => person.name)).toEqual([
      'You',
      'A former member',
    ]);
  });

  it('allows links on own and Shared Drive items, for members only when the owner allows', () => {
    expect(linkStateOf('own', true, null)).toBe('allowed');
    expect(linkStateOf('own', false, null)).toBe('members-off');
    expect(linkStateOf('shared', false, { membersMayShare: true })).toBe('allowed');
    expect(linkStateOf('own', false, { membersMayShare: false })).toBe('members-off');
    expect(linkStateOf('edit', true, null)).toBe('owner-only');
    expect(linkStateOf('view', false, { membersMayShare: true })).toBe('owner-only');
    expect(LINK_STATE_LINE['members-off']).toBe('The home owner turned off links for members');
    expect(LINK_STATE_LINE['owner-only']).toBe('Only the owner can share');
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
