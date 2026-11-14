import { describe, expect, it } from 'vitest';
import { ROUTES as DRIVE } from '../features/drive/routes';
import {
  DRIVE_SECTION_ROUTES,
  driveLocationHref,
  driveTopHref,
} from '../features/drive/model/section-routes';
import { href } from './hrefs';
import { ROUTES } from './routes';
import { landing, leafParams } from './route-landing.test-util';

const MINE = { id: 'r-mine', scope: 'person' } as const;
const HOME = { id: 'r-home', scope: 'home' } as const;

describe('drive links', () => {
  it('open every section inside the Drive tab section switcher', () => {
    expect(landing('/drive')).toBe('(drive) > drive/(sections) > index');
    for (const section of DRIVE_SECTION_ROUTES.filter((name) => name !== 'index')) {
      expect(landing(`/drive/${section}`)).toBe(`(drive) > drive/(sections) > ${section}`);
    }
  });

  it('push folders, smart folders, computers and placements on the Drive stack', () => {
    expect(landing('/drive/folder/f1')).toBe('(drive) > drive/folder/[folderId]');
    expect(landing('/drive/starred/a1')).toBe('(drive) > drive/starred/[albumId]');
    expect(landing('/drive/computers/d1')).toBe('(drive) > drive/computers/[deviceId]');
    expect(landing('/drive/placement/p1')).toBe('(drive) > drive/placement/[placementId]');
  });

  it('open the Drive tab from any other tab', () => {
    expect(landing('/drive/trash', ['(app)', '(home)', 'index'])).toBe(
      '(drive) > drive/(sections) > trash',
    );
  });

  it('carry the ids to the pushed pages', () => {
    expect(leafParams('/drive/folder/f1')).toEqual({ folderId: 'f1' });
    expect(leafParams('/drive/starred/a1')).toEqual({ albumId: 'a1' });
    expect(leafParams('/drive/computers/d1')).toEqual({ deviceId: 'd1' });
    expect(leafParams('/drive/placement/p1')).toEqual({ placementId: 'p1' });
  });
});

describe('drive entry points', () => {
  it('lists the sections in the order of the rail', () => {
    expect(DRIVE_SECTION_ROUTES).toEqual([
      'index',
      'shared-drive',
      'shared',
      'recent',
      'starred',
      'activity',
      'computers',
      'storage',
      'trash',
    ]);
  });

  it('has one searchable route for every section but the first, each under the Drive tab', () => {
    expect(DRIVE.map((route) => route.href)).toEqual(
      DRIVE_SECTION_ROUTES.filter((name) => name !== 'index').map((name) => `/drive/${name}`),
    );
    for (const route of DRIVE) {
      expect(route.tab).toBe('drive');
      expect(route.parent).toBe('drive');
      expect(route.searchable).toBe(true);
      expect(route.keywords.length).toBeGreaterThan(0);
    }
  });

  it('keeps every route key unique across the app', () => {
    const keys = ROUTES.map((route) => route.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('finds Computers by sync, mount and offline words', () => {
    const computers = DRIVE.find((route) => route.key === 'drive-computers');
    expect(computers?.keywords).toEqual(
      expect.arrayContaining(['sync', 'mount', 'offline', 'synced folders']),
    );
  });

  it('puts the Drive pages on matching hrefs', () => {
    expect(href.drive()).toBe('/drive');
    expect(href.drive({ item: 'i1' })).toStrictEqual({
      pathname: '/drive',
      params: { item: 'i1' },
    });
    expect(href.drivePage('shared-drive')).toStrictEqual({
      pathname: '/drive/shared-drive',
      params: {},
    });
    expect(href.driveFolder('f1', { item: 'i1' })).toStrictEqual({
      pathname: '/drive/folder/[folderId]',
      params: { item: 'i1', folderId: 'f1' },
    });
    expect(href.driveSmartFolder('a1')).toStrictEqual({
      pathname: '/drive/starred/[albumId]',
      params: { albumId: 'a1' },
    });
    expect(href.driveComputer('d1')).toStrictEqual({
      pathname: '/drive/computers/[deviceId]',
      params: { deviceId: 'd1' },
    });
    expect(href.drivePlacement('p1')).toStrictEqual({
      pathname: '/drive/placement/[placementId]',
      params: { placementId: 'p1' },
    });
  });
});

describe('drive locations', () => {
  it('opens the top of a drive on its own page', () => {
    expect(driveTopHref(MINE)).toBe('/drive');
    expect(driveTopHref(HOME)).toStrictEqual({ pathname: '/drive/shared-drive', params: {} });
  });

  it('opens a folder of any drive on the folder page', () => {
    expect(driveLocationHref([MINE], { rootId: 'r-other', folderId: 'f1' })).toStrictEqual({
      pathname: '/drive/folder/[folderId]',
      params: { folderId: 'f1' },
    });
  });

  it('opens the top of My Drive, the Shared Drive, or Shared with me for another drive', () => {
    const roots = [MINE, HOME];
    const params = { item: 'i1' };
    expect(driveLocationHref(roots, { rootId: 'r-mine', folderId: null, params })).toStrictEqual({
      pathname: '/drive',
      params,
    });
    expect(driveLocationHref(roots, { rootId: 'r-home', folderId: null, params })).toStrictEqual({
      pathname: '/drive/shared-drive',
      params,
    });
    expect(driveLocationHref(roots, { rootId: 'r-other', folderId: null, params })).toStrictEqual({
      pathname: '/drive/shared',
      params,
    });
  });
});
