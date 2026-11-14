import { describe, expect, it, vi } from 'vitest';
import { PHOTOS_SECTION_ROUTES } from '../features/photos/model/section-routes';
import { ROUTES as PHOTOS } from '../features/photos/routes';
import type { Availability } from '../store/selectors';
import { MAIN_PAGES } from './main-pages';
import { ROUTES } from './routes';
import { TAB_NAMES } from './tab-names';
import { href } from './hrefs';
import { landing, leafParams } from './route-landing.test-util';

const platform = vi.hoisted((): { native: boolean } => ({ native: false }));

vi.mock(import('../design/platform'), async (original) => ({
  ...(await original()),
  isNative: (): boolean => platform.native,
  desktopBridge: (): null => null,
}));

const AVAILABILITY: Availability = {
  hasDevices: false,
  hasClimate: false,
  hasCameras: false,
  hasHealth: false,
  hasScenes: false,
  hasEnergy: false,
  hasSecurity: false,
  hasIr: false,
  hasWatch: false,
  needsAttention: false,
};

describe('photos links', () => {
  it('open every section inside the Photos tab section switcher', () => {
    expect(landing('/photos')).toBe('(photos) > photos/(sections) > index');
    for (const section of PHOTOS_SECTION_ROUTES.filter((name) => name !== 'index')) {
      expect(landing(`/photos/${section.replace(/\/index$/, '')}`)).toBe(
        `(photos) > photos/(sections) > ${section}`,
      );
    }
  });

  it('keep the album, place and viewer pages as pushes on the Photos stack', () => {
    expect(landing('/photos/albums/a1')).toBe('(photos) > photos/albums/[albumId]');
    expect(landing('/photos/places/p1')).toBe('(photos) > photos/places/[placeId]');
    expect(landing('/photos/view/i1')).toBe('(photos) > photos/view/[itemId]');
  });

  it('open the Photos tab from any other tab', () => {
    expect(landing('/photos/deleted', ['(app)', '(home)', 'index'])).toBe(
      '(photos) > photos/(sections) > deleted',
    );
  });

  it('carry the ids to the pushed pages', () => {
    expect(leafParams('/photos/albums/a1')).toEqual({ albumId: 'a1' });
    expect(leafParams('/photos/places/p1')).toEqual({ placeId: 'p1' });
    expect(leafParams('/photos/view/i1')).toEqual({ itemId: 'i1' });
  });
});

describe('photos entry points', () => {
  it('lists the sections in the order of the section switcher', () => {
    expect(PHOTOS_SECTION_ROUTES).toEqual(['index', 'albums/index', 'map', 'insights', 'deleted']);
  });

  it('has a search entry for every Library tab and every other section, each under the Photos tab', () => {
    expect(PHOTOS.map((route) => [route.key, route.href])).toEqual([
      ['photos-favourites', { pathname: '/photos', params: { tab: 'favourites' } }],
      ['photos-videos', { pathname: '/photos', params: { tab: 'videos' } }],
      ['photos-screenshots', { pathname: '/photos', params: { tab: 'screenshots' } }],
      ['photos-device', { pathname: '/photos', params: { tab: 'device' } }],
      ['photos-cameras', { pathname: '/photos', params: { tab: 'cameras' } }],
      ['photos-ai', { pathname: '/photos', params: { tab: 'ai' } }],
      ['photos-albums', { pathname: '/photos/albums', params: {} }],
      ['photos-map', { pathname: '/photos/map', params: {} }],
      ['photos-insights', { pathname: '/photos/insights', params: {} }],
      ['photos-deleted', { pathname: '/photos/deleted', params: {} }],
    ]);
    for (const route of PHOTOS) {
      expect(route.tab).toBe('photos');
      expect(route.parent).toBe('photos');
    }
  });

  it('gives every Photos entry a key no other route uses', () => {
    const keys = ROUTES.map((route) => route.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('photos');
  });

  it('drops the memories keywords and moves search to the Library and trips to Albums', () => {
    const library = ROUTES.find((route) => route.key === 'photos');
    const albums = PHOTOS.find((route) => route.key === 'photos-albums');
    const words = [...ROUTES.filter((route) => route.tab === 'photos')].flatMap(
      (route) => route.keywords,
    );
    expect(words).not.toContain('memories');
    expect(words).not.toContain('on this day');
    expect(words).not.toContain('year in review');
    expect(library?.keywords).toContain('search photos');
    expect(albums?.keywords).toContain('trips');
  });

  it('offers the On this device tab only where the app has a local media source', () => {
    const device = PHOTOS.find((route) => route.key === 'photos-device');
    expect(device?.available(AVAILABILITY)).toBe(false);
    expect(PHOTOS.filter((route) => !route.available(AVAILABILITY)).map((r) => r.key)).toEqual([
      'photos-device',
    ]);
    platform.native = true;
    expect(device?.available(AVAILABILITY)).toBe(true);
    platform.native = false;
  });

  it('puts the Photos entry between the other pages and Drive', () => {
    const tabs = MAIN_PAGES.map((page) => page.tab);
    expect(tabs.indexOf('photos')).toBe(tabs.indexOf('drive') - 1);
    expect(TAB_NAMES.indexOf('(photos)')).toBe(TAB_NAMES.indexOf('(drive)') - 1);
  });

  it('puts the Photos page and the section links on matching hrefs', () => {
    expect(href.photos()).toBe('/photos');
    expect(href.photos({ q: '' })).toBe('/photos');
    expect(href.photos({ tab: 'videos', q: 'beach' })).toStrictEqual({
      pathname: '/photos',
      params: { tab: 'videos', q: 'beach' },
    });
    expect(href.photos({ q: 'lisbon' })).toStrictEqual({
      pathname: '/photos',
      params: { q: 'lisbon' },
    });
    expect(href.photosPage('map')).toStrictEqual({ pathname: '/photos/map', params: {} });
    expect(href.photosAlbum('a1')).toStrictEqual({
      pathname: '/photos/albums/[albumId]',
      params: { albumId: 'a1' },
    });
    expect(href.photosPlace('p1')).toStrictEqual({
      pathname: '/photos/places/[placeId]',
      params: { placeId: 'p1' },
    });
    expect(href.photosItem('i1')).toStrictEqual({
      pathname: '/photos/view/[itemId]',
      params: { itemId: 'i1' },
    });
  });
});
