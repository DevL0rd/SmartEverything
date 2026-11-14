import { describe, expect, it } from 'vitest';
import type { SearchToken } from '../search/tokens';
import { scopeOf } from './library-scope';
import { tabById } from './library-tabs';

const PORTUGAL: SearchToken = { kind: 'country', countryCode: 'PT', label: 'Portugal' };
const LISBON: SearchToken = { kind: 'place', placeId: 3, label: 'Lisbon' };
const PORTO: SearchToken = { kind: 'place', placeId: 4, label: 'Porto' };
const YEAR: SearchToken = { kind: 'date', from: '2026-01-01', to: '2026-12-31', label: '2026' };
const VIDEOS: SearchToken = { kind: 'media', media: 'video', label: 'Videos' };
const PHOTOS: SearchToken = { kind: 'media', media: 'image', label: 'Photos' };
const SONY: SearchToken = { kind: 'camera', label: 'Sony A7 IV' };
const FAVOURITES: SearchToken = { kind: 'favourites', label: 'Favourites' };
const ALBUM_ID = '00000000-0000-4000-8000-0000000000a1';
const ALBUM: SearchToken = { kind: 'album', albumId: ALBUM_ID, label: 'Trip' };

function input(
  tokens: readonly SearchToken[],
  text = '',
): { tokens: readonly SearchToken[]; text: string } {
  return { tokens, text };
}

describe('the hub scope of a Library tab', () => {
  it('is the tab filter alone when nothing is searched', () => {
    expect(scopeOf(tabById('all'), input([]))).toEqual({
      kind: 'hub',
      scope: { filter: 'all' },
      unused: [],
    });
    expect(scopeOf(tabById('screenshots'), input([])).kind).toBe('hub');
    expect(scopeOf(tabById('screenshots'), input([]))).toMatchObject({
      scope: { filter: 'screenshots' },
    });
  });

  it('carries every token and the typed words into the scope', () => {
    expect(
      scopeOf(tabById('all'), input([LISBON, PORTUGAL, SONY, ALBUM, YEAR], ' beach ')),
    ).toEqual({
      kind: 'hub',
      scope: {
        filter: 'all',
        placeId: 3,
        countryCode: 'PT',
        camera: 'Sony A7 IV',
        albumId: ALBUM_ID,
        text: 'beach',
        from: '2026-01-01',
        to: '2026-12-31',
      },
      unused: [],
    });
  });

  it('lets a favourites or video token pick the filter on All only', () => {
    expect(scopeOf(tabById('all'), input([FAVOURITES]))).toMatchObject({
      scope: { filter: 'favourites' },
      unused: [],
    });
    expect(scopeOf(tabById('all'), input([VIDEOS]))).toMatchObject({
      scope: { filter: 'videos' },
      unused: [],
    });
    expect(scopeOf(tabById('videos'), input([VIDEOS]))).toMatchObject({
      scope: { filter: 'videos' },
      unused: [],
    });
    expect(scopeOf(tabById('videos'), input([FAVOURITES]))).toMatchObject({
      scope: { filter: 'videos' },
      unused: [FAVOURITES],
    });
    expect(scopeOf(tabById('favourites'), input([VIDEOS]))).toMatchObject({
      scope: { filter: 'favourites' },
      unused: [VIDEOS],
    });
  });

  it('keeps the first of a kind, the filter claimed first and reports the rest as unused', () => {
    expect(scopeOf(tabById('all'), input([LISBON, PORTO, FAVOURITES, VIDEOS]))).toMatchObject({
      scope: { filter: 'favourites', placeId: 3 },
      unused: [PORTO, VIDEOS],
    });
  });

  it('cannot express a photos-only token and reports it as unused', () => {
    expect(scopeOf(tabById('all'), input([PHOTOS]))).toMatchObject({
      scope: { filter: 'all' },
      unused: [PHOTOS],
    });
  });
});

describe('the source and device queries of a Library tab', () => {
  it('uses only the typed words and the date on Cameras and Made with AI', () => {
    expect(scopeOf(tabById('cameras'), input([YEAR, LISBON, SONY], 'cat'))).toEqual({
      kind: 'source',
      source: 'cameras',
      search: { text: 'cat', from: '2026-01-01', to: '2026-12-31' },
      unused: [LISBON, SONY],
    });
    expect(scopeOf(tabById('ai'), input([]))).toEqual({
      kind: 'source',
      source: 'ai',
      search: { text: null, from: null, to: null },
      unused: [],
    });
  });

  it('uses only the typed words and the date on On this device', () => {
    expect(scopeOf(tabById('device'), input([YEAR, VIDEOS, FAVOURITES], 'IMG'))).toEqual({
      kind: 'device',
      search: { text: 'IMG', from: '2026-01-01', to: '2026-12-31' },
      unused: [VIDEOS, FAVOURITES],
    });
  });
});
