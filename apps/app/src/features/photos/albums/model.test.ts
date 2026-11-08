import { describe, expect, it } from 'vitest';
import { DRIVE_ALBUM, type DriveAlbum, type SmartRule } from '@smarteverything/domain';
import {
  albumGroups,
  albumsLine,
  dayRange,
  leafText,
  ruleLead,
  ruleLine,
  visibilityOf,
} from './model';

const OWNER = 'a1b2c3d4-0000-4000-8000-0000000000aa';

const TRIP_RULE: SmartRule = {
  match: 'all',
  rules: [
    { kind: 'date_range', field: 'takenAt', from: '2026-11-03', to: '2026-11-07' },
    { kind: 'text', field: 'camera', contains: 'A7 IV' },
  ],
};

function album(
  index: number,
  title: string,
  kind: DriveAlbum['kind'],
  fields: { readonly itemCount: number; readonly updatedAt: string },
): DriveAlbum {
  return DRIVE_ALBUM.parse({
    id: `a1b2c3d4-0000-4000-8000-00000000000${String(index)}`,
    title,
    surface: 'photos',
    scope: index % 2 === 0 ? 'home' : 'person',
    ownerProfileId: index % 2 === 0 ? null : OWNER,
    coverItemId: null,
    itemCount: fields.itemCount,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: fields.updatedAt,
    kind,
    ...(kind === 'smart' ? { rule: TRIP_RULE } : {}),
  });
}

const TOKYO = album(1, 'Tokyo', 'manual', { itemCount: 412, updatedAt: '2026-04-20T00:00:00Z' });
const AUTUMN = album(2, 'Best of autumn', 'manual', {
  itemCount: 86,
  updatedAt: '2026-11-07T00:00:00Z',
});
const LISBON = album(3, 'Lisbon 2026', 'smart', {
  itemCount: 204,
  updatedAt: '2026-11-06T00:00:00Z',
});

describe('album model', () => {
  it('splits smart and manual albums and sorts each by the chosen order', () => {
    const recent = albumGroups([TOKYO, AUTUMN, LISBON], 'recent');
    expect(recent.smart.map((each) => each.title)).toStrictEqual(['Lisbon 2026']);
    expect(recent.manual.map((each) => each.title)).toStrictEqual(['Best of autumn', 'Tokyo']);
    expect(albumGroups([TOKYO, AUTUMN], 'items').manual[0]?.title).toBe('Tokyo');
    expect(albumGroups([TOKYO, AUTUMN], 'name').manual[0]?.title).toBe('Best of autumn');
  });

  it('counts albums and smart albums in the header line', () => {
    expect(albumsLine([TOKYO, AUTUMN, LISBON])).toBe('3 albums · 1 smart album fills itself');
    expect(albumsLine([TOKYO])).toBe('1 album');
  });

  it('names who sees an album with the copy used everywhere', () => {
    expect(visibilityOf('person')).toStrictEqual({ label: 'Only you', icon: 'lock' });
    expect(visibilityOf('home')).toStrictEqual({ label: 'Everyone at home', icon: 'users' });
  });

  it('writes day ranges without repeating the month or year', () => {
    expect(dayRange('2026-11-03', '2026-11-07')).toBe('3 to 7 Nov 2026');
    expect(dayRange('2026-09-14', '2026-11-07')).toBe('14 Sep to 7 Nov 2026');
    expect(dayRange('2021-12-30', '2022-01-02')).toBe('30 Dec 2021 to 2 Jan 2022');
    expect(dayRange('2026-03-12', '2026-03-12')).toBe('12 Mar 2026');
  });

  it('describes every rule kind in plain words', () => {
    expect(ruleLine(TRIP_RULE)).toBe('Taken 3 to 7 Nov 2026 · Camera A7 IV');
    expect(ruleLine({ ...TRIP_RULE, match: 'any' })).toBe('Taken 3 to 7 Nov 2026 or Camera A7 IV');
    expect(ruleLead(TRIP_RULE)).toBe('Updates itself when all rules match');
    expect(ruleLead({ ...TRIP_RULE, match: 'any' })).toBe('Updates itself when any rule matches');
    expect(leafText({ kind: 'item_kind', itemKinds: ['image', 'video'] })).toBe(
      'Photos and videos',
    );
    expect(leafText({ kind: 'starred', starred: true })).toBe('Favourites');
    expect(leafText({ kind: 'date_range', field: 'addedAt', from: null, to: '2026-01-31' })).toBe(
      'Added until 31 Jan 2026',
    );
    expect(leafText({ kind: 'duration_range', minMs: 60_000, maxMs: null })).toBe(
      'Length over 1:00',
    );
  });
});
