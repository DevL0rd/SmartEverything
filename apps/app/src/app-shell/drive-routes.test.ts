import { describe, expect, it } from 'vitest';
import { ROUTES as DRIVE } from '../features/drive/routes';
import { DRIVE_SECTION_ROUTES } from '../features/drive/model/section-routes';
import { href } from './hrefs';
import { landing, leafParams } from './route-landing.test-util';

describe('drive links', () => {
  it('open every section inside the Drive tab section switcher', () => {
    expect(landing('/drive')).toBe('(drive) > drive/(sections) > index');
    for (const section of DRIVE_SECTION_ROUTES.filter((name) => name !== 'index')) {
      expect(landing(`/drive/${section}`)).toBe(`(drive) > drive/(sections) > ${section}`);
    }
  });

  it('keep the folder and synced folder pages as pushes on the Drive stack', () => {
    expect(landing('/drive/root/r1')).toBe('(drive) > drive/root/[rootId]');
    expect(landing('/drive/sync/r1')).toBe('(drive) > drive/sync/[rootId]');
  });

  it('open the Drive tab from any other tab', () => {
    expect(landing('/drive/trash', ['(app)', '(home)', 'index'])).toBe(
      '(drive) > drive/(sections) > trash',
    );
  });

  it('carry the root id to the folder pages', () => {
    expect(leafParams('/drive/root/r1')).toEqual({ rootId: 'r1' });
    expect(leafParams('/drive/sync/r2')).toEqual({ rootId: 'r2' });
  });
});

describe('drive entry points', () => {
  it('lists the sections in the order of the section switcher', () => {
    expect(DRIVE_SECTION_ROUTES).toEqual([
      'index',
      'recent',
      'starred',
      'shared',
      'activity',
      'sync',
      'computers',
      'storage',
      'trash',
    ]);
  });

  it('has a route for every section but the first, each under the Drive tab', () => {
    const keysOf = DRIVE.map((route) => route.key);
    expect(keysOf).toEqual([
      'drive-recent',
      'drive-starred',
      'drive-shared',
      'drive-activity',
      'drive-sync',
      'drive-computers',
      'drive-storage',
      'drive-trash',
    ]);
    for (const route of DRIVE) {
      expect(route.tab).toBe('drive');
      expect(route.parent).toBe('drive');
    }
  });

  it('puts the Drive page and the section links on matching hrefs', () => {
    expect(href.drive()).toBe('/drive');
    expect(href.drivePage('sync')).toStrictEqual({ pathname: '/drive/sync', params: {} });
    expect(href.driveRoot('r1')).toStrictEqual({
      pathname: '/drive/root/[rootId]',
      params: { rootId: 'r1' },
    });
    expect(href.driveSyncFolder('r1')).toStrictEqual({
      pathname: '/drive/sync/[rootId]',
      params: { rootId: 'r1' },
    });
  });
});
