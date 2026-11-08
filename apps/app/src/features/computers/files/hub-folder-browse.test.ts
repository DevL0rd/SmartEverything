import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DriveHostFolders } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { HostFoldersQuery } from './hub-folder-browse';
import { COLOUR_VARIABLE, PaletteContext } from '../../../design/colour-roles';

vi.mock('../../../api/transport', () => ({ api: vi.fn() }));
vi.mock('../../../store/selectors', () => ({ useSyncStatus: vi.fn() }));

const { HUB_DISKS_PATH, hubCrumbs, hubFolderView } = await import('./hub-folder-browse');
const { HostFolderList } = await import('./hub-folder-picker');

function query(patch: Partial<HostFoldersQuery>): HostFoldersQuery {
  return {
    isError: false,
    error: null,
    data: undefined,
    isPlaceholderData: false,
    refetch: vi.fn(),
    ...patch,
  };
}

const DISKS: DriveHostFolders = {
  path: null,
  parent: null,
  folders: [
    { name: 'volume1', path: '/volume1', hidden: false },
    { name: 'volume2', path: '/volume2', hidden: false },
  ],
};

const MEDIA: DriveHostFolders = {
  path: '/volume1/media',
  parent: '/volume1',
  folders: [
    { name: '.cache', path: '/volume1/media/.cache', hidden: true },
    { name: 'Films', path: '/volume1/media/Films', hidden: false },
  ],
};

function markup(listing: DriveHostFolders, showHidden: boolean): string {
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: COLOUR_VARIABLE },
      createElement(HostFolderList, {
        view: { kind: 'ready', listing, stale: false },
        showHidden,
        onGo: () => undefined,
        compact: true,
      }),
    ),
  );
}

describe('hub folder breadcrumbs', () => {
  it('starts every trail at the list of hub disks', () => {
    expect(hubCrumbs(null, ['/volume1'])).toEqual([{ label: 'Hub disks', path: HUB_DISKS_PATH }]);
  });

  it('walks from the disk that holds the folder down to the folder', () => {
    expect(hubCrumbs('/volume1/media/Films', ['/', '/volume1'])).toEqual([
      { label: 'Hub disks', path: HUB_DISKS_PATH },
      { label: '/volume1', path: '/volume1' },
      { label: 'media', path: '/volume1/media' },
      { label: 'Films', path: '/volume1/media/Films' },
    ]);
  });

  it('builds child paths under the root disk without doubled slashes', () => {
    expect(hubCrumbs('/srv/share', ['/']).map((crumb) => crumb.path)).toEqual([
      HUB_DISKS_PATH,
      '/',
      '/srv',
      '/srv/share',
    ]);
  });

  it('does not match a disk that only shares a name prefix', () => {
    expect(hubCrumbs('/volume10/a', ['/volume1']).map((crumb) => crumb.label)).toEqual([
      'Hub disks',
      '/volume10/a',
    ]);
  });
});

describe('hub folder view', () => {
  it('is blocked while the hub is offline', () => {
    expect(hubFolderView(false, query({ data: MEDIA }))).toMatchObject({
      kind: 'blocked',
      title: 'Hub is offline',
    });
  });

  it('shows the hub error, such as a folder outside the hub disks', () => {
    const error = new Error('The folder is outside the hub host disks.');
    expect(hubFolderView(true, query({ isError: true, error }))).toMatchObject({
      kind: 'error',
      error,
    });
  });

  it('is loading until the first listing arrives, then ready', () => {
    expect(hubFolderView(true, query({}))).toEqual({ kind: 'loading' });
    expect(hubFolderView(true, query({ data: MEDIA, isPlaceholderData: true }))).toEqual({
      kind: 'ready',
      listing: MEDIA,
      stale: true,
    });
  });
});

describe('hub folder list', () => {
  it('lists the hub disks by their mount point', () => {
    const html = markup(DISKS, false);
    expect(html).toContain('/volume1');
    expect(html).toContain('/volume2');
    expect(html).toContain('Disk');
  });

  it('hides hidden folders until they are asked for', () => {
    expect(markup(MEDIA, false)).not.toContain('.cache');
    expect(markup(MEDIA, false)).toContain('Films');
    expect(markup(MEDIA, true)).toContain('.cache');
  });

  it('says a folder is empty and can still be chosen', () => {
    expect(markup({ ...MEDIA, folders: [] }, false)).toContain('This folder is empty');
    expect(markup({ ...DISKS, folders: [] }, false)).toContain('No disks on the hub');
  });
});
