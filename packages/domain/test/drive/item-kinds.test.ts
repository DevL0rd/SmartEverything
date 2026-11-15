import { describe, expect, it } from 'vitest';
import { DRIVE_ITEM, DRIVE_ITEM_KINDS } from '../../src/drive/item';

const A = '11111111-1111-4111-8111-111111111111';
const AT = '2026-11-07T10:00:00.000Z';

const BASE = {
  id: A,
  rootId: A,
  parentId: null,
  relPath: 'l',
  name: 'l',
  modifiedAt: AT,
  addedAt: AT,
  openedAt: null,
  starred: false,
  shared: false,
  locked: false,
  lockedHere: false,
  openComments: 0,
  rev: 1,
  etag: 'e',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
};

describe('the link and special item kinds', () => {
  it('lists them among the kinds', () => {
    expect(DRIVE_ITEM_KINDS).toContain('link');
    expect(DRIVE_ITEM_KINDS).toContain('special');
  });

  it('accepts a link with its target and refuses one without', () => {
    const link = { ...BASE, kind: 'link', bytes: 6, linkTarget: 'target' };
    expect(DRIVE_ITEM.safeParse(link).success).toBe(true);
    const { linkTarget: _omitted, ...without } = link;
    expect(DRIVE_ITEM.safeParse(without).success).toBe(false);
    expect(DRIVE_ITEM.safeParse({ ...link, linkTarget: '' }).success).toBe(false);
  });

  it('accepts a special file with no content fields and refuses content fields on it', () => {
    const special = { ...BASE, kind: 'special', bytes: 0 };
    expect(DRIVE_ITEM.safeParse(special).success).toBe(true);
    expect(DRIVE_ITEM.safeParse({ ...special, mime: 'x/y' }).success).toBe(false);
  });
});
