import type { FileEntry, FileSearchMatch } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  matchOf,
  nodeOfEntry,
  nodeOfFolder,
  nodeOfTrash,
  placedPathsOf,
  placementMarkOf,
  type PlacedPath,
  type PlacementSource,
} from './computer-node';

const DEVICE = '0b9f3c2e-3c38-4a4f-9d55-6a1f6d4b2a10';

const MOMENT = '2026-11-14T10:00:00.000Z';

function entry(change: Partial<FileEntry>): FileEntry {
  return {
    name: 'notes.txt',
    path: '/home/dana/notes.txt',
    kind: 'file',
    mime: 'text/plain',
    size: 4200,
    modifiedAt: MOMENT,
    hidden: false,
    ...change,
  };
}

describe('computer file nodes', () => {
  it('maps a file by its mime type and keeps its path as the key', () => {
    const node = nodeOfEntry(entry({}), true, []);
    expect(node).toMatchObject({
      key: '/home/dana/notes.txt',
      parentKey: '/home/dana',
      kind: 'document',
      mime: 'text/plain',
      size: 4200,
      writable: true,
      exportable: true,
      hidden: false,
      origin: { path: '/home/dana/notes.txt', trashId: null },
    });
  });

  it('finds the kind from the name when the computer gave no mime', () => {
    expect(nodeOfEntry(entry({ name: 'trip.mp4', mime: null }), true, []).kind).toBe('video');
    expect(nodeOfEntry(entry({ name: 'a.zip', mime: 'application/zip' }), true, []).kind).toBe(
      'archive',
    );
  });

  it('maps folders, links and special files', () => {
    const folder = nodeOfEntry(entry({ kind: 'folder', mime: null, size: 4096 }), false, []);
    expect(folder.kind).toBe('folder');
    expect(folder.size).toBeNull();
    expect(folder.writable).toBe(false);
    expect(nodeOfEntry(entry({ kind: 'link' }), true, []).kind).toBe('link');
    const special = nodeOfEntry(entry({ kind: 'other', mime: null }), true, []);
    expect(special.kind).toBe('special');
    expect(special.entry).toEqual({
      line: 'Pipe, socket or device entry',
      stays: 'It stays on this computer and cannot be opened or downloaded.',
    });
    expect(special.exportable).toBe(false);
  });

  it('keeps the hidden flag the computer reports', () => {
    expect(nodeOfEntry(entry({ name: '.bashrc', hidden: true }), true, []).hidden).toBe(true);
  });

  it('puts the root of a path under no parent', () => {
    expect(nodeOfFolder('/', '/', true, []).parentKey).toBeNull();
    expect(nodeOfFolder('/home', 'home', true, []).parentKey).toBe('/');
  });

  it('keys a Trash item by its trash id and remembers where it was', () => {
    const node = nodeOfTrash({
      trashId: 'abc',
      name: 'old.txt',
      originalPath: '/home/dana/old.txt',
      deletedAt: MOMENT,
      size: 12,
      kind: 'file',
    });
    expect(node).toMatchObject({
      key: 'abc',
      parentKey: null,
      kind: 'document',
      modifiedAt: MOMENT,
      exportable: false,
      writable: true,
      origin: { path: '/home/dana/old.txt', trashId: 'abc' },
    });
  });

  it('maps a name hit without a snippet and a text hit with its line and ranges', () => {
    const name: FileSearchMatch = {
      entry: entry({}),
      hit: { kind: 'name', snippet: 'notes.txt', line: null, ranges: [{ start: 0, end: 5 }] },
    };
    const text: FileSearchMatch = {
      entry: entry({}),
      hit: { kind: 'text', snippet: 'pay the invoice', line: 4, ranges: [{ start: 8, end: 15 }] },
    };
    expect(matchOf(name, true, []).hit).toEqual({
      where: 'name',
      snippet: null,
      line: null,
      ranges: [{ start: 0, end: 5 }],
    });
    expect(matchOf(text, true, []).hit).toEqual({
      where: 'text',
      snippet: 'pay the invoice',
      line: 4,
      ranges: [{ start: 8, end: 15 }],
    });
  });
});

function placement(change: Partial<PlacementSource>): PlacementSource {
  return { deviceId: DEVICE, localPath: null, status: { mountPoint: null }, ...change };
}

describe('placement marks', () => {
  it('collects the synced folder and the mount point of this computer only', () => {
    const placed = placedPathsOf(DEVICE, [
      placement({ localPath: '/home/dana/Drive/', status: { mountPoint: null } }),
      placement({ status: { mountPoint: '/mnt/drive' } }),
      placement({ deviceId: 'other', localPath: '/elsewhere' }),
      placement({ status: { mountPoint: null } }),
    ]);
    expect(placed).toEqual([
      { path: '/home/dana/Drive', mark: 'synced' },
      { path: '/mnt/drive', mark: 'mounted' },
    ]);
  });

  it('marks only a folder whose path is placed', () => {
    const placed: readonly PlacedPath[] = [
      { path: '/home/dana/Drive', mark: 'synced' },
      { path: '/mnt/drive', mark: 'mounted' },
    ];
    const synced = nodeOfEntry(
      entry({ kind: 'folder', path: '/home/dana/Drive', name: 'Drive' }),
      true,
      placed,
    );
    expect(synced.marks.placement).toBe('synced');
    const file = nodeOfEntry(entry({ path: '/mnt/drive' }), true, placed);
    expect(file.marks.placement).toBeNull();
    expect(placementMarkOf('/mnt/drive/', placed)).toBe('mounted');
    expect(placementMarkOf('/home', placed)).toBeNull();
  });
});
