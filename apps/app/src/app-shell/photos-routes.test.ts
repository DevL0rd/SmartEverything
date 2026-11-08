import { describe, expect, it } from 'vitest';
import { PHOTOS_SECTION_ROUTES } from '../features/photos/model/section-routes';
import { ROUTES as PHOTOS } from '../features/photos/routes';
import { MAIN_PAGES } from './main-pages';
import { TAB_NAMES } from './tab-names';
import { href } from './hrefs';
import { landing, leafParams } from './route-landing.test-util';

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
    expect(PHOTOS_SECTION_ROUTES).toEqual([
      'index',
      'search',
      'memories',
      'albums/index',
      'map',
      'favourites',
      'videos',
      'screenshots',
      'cameras',
      'ai',
      'duplicates',
      'backup',
      'insights',
      'deleted',
    ]);
  });

  it('has a route for every section but the first, each under the Photos tab', () => {
    expect(PHOTOS.map((route) => route.key)).toEqual([
      'photos-search',
      'photos-memories',
      'photos-albums',
      'photos-map',
      'photos-favourites',
      'photos-videos',
      'photos-screenshots',
      'photos-cameras',
      'photos-ai',
      'photos-duplicates',
      'photos-backup',
      'photos-insights',
      'photos-deleted',
    ]);
    for (const route of PHOTOS) {
      expect(route.tab).toBe('photos');
      expect(route.parent).toBe('photos');
    }
  });

  it('puts the Photos entry between the other pages and Drive', () => {
    const tabs = MAIN_PAGES.map((page) => page.tab);
    expect(tabs.indexOf('photos')).toBe(tabs.indexOf('drive') - 1);
    expect(TAB_NAMES.indexOf('(photos)')).toBe(TAB_NAMES.indexOf('(drive)') - 1);
  });

  it('puts the Photos page and the section links on matching hrefs', () => {
    expect(href.photos()).toBe('/photos');
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
