import { describe, expect, it } from 'vitest';
import { DRIVE_ALBUM, type DriveAlbum, type Trip } from '@smarteverything/domain';
import { actionsOf, albumIdOf } from './album-screen';
import { albumsActions } from './albums-screen';
import { AlbumScreen, AlbumsScreen } from './index';
import { ruleOf } from './rule-draft';
import { startersOf } from './starters';

const TRIP: Trip = {
  id: 'trip-1',
  kind: 'trip',
  from: '2026-11-03',
  to: '2026-11-07',
  count: 204,
  coverItemId: 'a1b2c3d4-0000-4000-8000-000000000101',
  placeId: 1,
  placeName: 'Lisbon',
  distanceFromHomeKm: null,
  places: 1,
  perDay: [{ day: '2026-11-03', count: 1 }],
};

function albumOf(kind: DriveAlbum['kind']): DriveAlbum {
  return DRIVE_ALBUM.parse({
    id: 'a1b2c3d4-0000-4000-8000-000000000005',
    title: 'Garden',
    surface: 'photos',
    scope: 'home',
    ownerProfileId: null,
    coverItemId: null,
    itemCount: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    kind,
    ...(kind === 'smart'
      ? { rule: { match: 'all', rules: [{ kind: 'starred', starred: true }] } }
      : {}),
  });
}

describe('albums screens', () => {
  it('keeps Edit rules on the rule line and offers Rename only for manual albums', () => {
    const noop = (): void => undefined;
    expect(actionsOf(null, noop, noop)).toStrictEqual([]);
    expect(actionsOf(albumOf('smart'), noop, noop).map((action) => action.label)).toStrictEqual([
      'Delete album',
    ]);
    expect(actionsOf(albumOf('manual'), noop, noop).map((action) => action.label)).toStrictEqual([
      'Rename',
      'Delete album',
    ]);
  });

  it('keeps New album as the one primary next to New smart album', () => {
    const noop = (): void => undefined;
    expect(
      albumsActions(noop, noop).map((action) => [action.label, action.primary === true]),
    ).toStrictEqual([
      ['New smart album', false],
      ['New album', true],
    ]);
  });

  it('load as components', () => {
    expect(typeof AlbumsScreen).toBe('function');
    expect(typeof AlbumScreen).toBe('function');
  });

  it('read only an album id from the route', () => {
    expect(albumIdOf('a1b2c3d4-0000-4000-8000-000000000005')).toBe(
      'a1b2c3d4-0000-4000-8000-000000000005',
    );
    expect(albumIdOf('lisbon')).toBeNull();
    expect(albumIdOf(undefined)).toBeNull();
  });

  it('offers every trip newest first and every named camera by use as smart album starters', () => {
    const older = {
      ...TRIP,
      id: 'trip-0',
      from: '2025-08-01',
      to: '2025-08-09',
      count: 1,
      placeName: 'Lakes',
    };
    const starters = startersOf(
      [older, TRIP],
      [
        { make: 'Google', model: 'Pixel 9', items: 900 },
        { make: null, model: null, items: 12 },
        { make: 'Sony', model: 'A7 IV', items: 3412 },
      ],
    );
    expect(starters.map((starter) => [starter.title, starter.line])).toStrictEqual([
      ['A trip', '2 found'],
      ['A camera', '2 cameras'],
    ]);
    const [trips, cameras] = starters;
    expect(trips?.choices.map((choice) => [choice.label, choice.description])).toStrictEqual([
      ['Lisbon', '3 to 7 Nov 2026 · 204 items'],
      ['Lakes', '1 to 9 Aug 2025 · 1 item'],
    ]);
    expect(trips?.choices[0]?.draft.title).toBe('Lisbon 2026');
    expect(cameras?.choices.map((choice) => choice.label)).toStrictEqual([
      'Sony A7 IV',
      'Google Pixel 9',
    ]);
    const sony = cameras?.choices[0];
    expect(sony === undefined ? null : ruleOf(sony.draft)).toStrictEqual({
      match: 'all',
      rules: [{ kind: 'text', field: 'camera', contains: 'A7 IV' }],
    });
  });

  it('leaves a starter out when there is nothing to start from', () => {
    expect(startersOf(undefined, [])).toStrictEqual([]);
    expect(startersOf([], [{ make: null, model: null, items: 4 }])).toStrictEqual([]);
  });
});
