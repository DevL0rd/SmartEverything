import { describe, expect, it } from 'vitest';
import type { DriveZipEntry } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import {
  firstExpanded,
  isTextName,
  isZipNode,
  packedLineOf,
  toggled,
  zipHeadlineOf,
  zipOpenOf,
  zipRowsOf,
  zipSegmentsOf,
  zipTreeOf,
} from './zip-model';

let next = 0;

function entry(path: string, bytes: number, over: Partial<DriveZipEntry> = {}): DriveZipEntry {
  const folder = path.endsWith('/');
  const name = path.replace(/\/$/, '').split('/').at(-1) ?? path;
  next += 1;
  return {
    index: next,
    path,
    name,
    folder,
    bytes,
    compressedBytes: Math.round(bytes / 2),
    modifiedAt: null,
    encrypted: false,
    kind: folder ? 'folder' : 'other',
    ...over,
  };
}

describe('zipTreeOf', () => {
  it('builds folders from paths, including folders the archive never lists', () => {
    const tree = zipTreeOf([
      entry('Trip/Day 1/beach.jpg', 400, { kind: 'image' }),
      entry('Trip/notes.txt', 100, { kind: 'document' }),
      entry('readme.md', 50, { kind: 'document' }),
    ]);
    expect(tree.map((node) => node.name)).toEqual(['Trip', 'readme.md']);
    const trip = tree[0];
    expect(trip?.folder).toBe(true);
    expect(trip?.entry).toBeNull();
    expect(trip?.bytes).toBe(500);
    expect(trip?.files).toBe(2);
    expect(trip?.children.map((node) => node.name)).toEqual(['Day 1', 'notes.txt']);
  });

  it('keeps a listed folder entry on its node and sorts folders before files', () => {
    const tree = zipTreeOf([entry('b.txt', 1), entry('a/', 0), entry('a/x.txt', 3)]);
    expect(tree.map((node) => node.name)).toEqual(['a', 'b.txt']);
    expect(tree[0]?.entry?.folder).toBe(true);
    expect(tree[0]?.bytes).toBe(3);
  });

  it('orders names naturally', () => {
    const tree = zipTreeOf([entry('page 10.txt', 1), entry('page 2.txt', 1)]);
    expect(tree.map((node) => node.name)).toEqual(['page 2.txt', 'page 10.txt']);
  });
});

describe('zipRowsOf', () => {
  const tree = zipTreeOf([
    entry('Trip/a.jpg', 300, { kind: 'image' }),
    entry('Trip/b.jpg', 100, { kind: 'image' }),
    entry('c.txt', 200, { kind: 'document' }),
  ]);

  it('shows only the top level until a folder opens', () => {
    expect(zipRowsOf(tree, new Set()).map((row) => row.node.path)).toEqual(['Trip', 'c.txt']);
  });

  it('indents the children of an open folder and sizes bars against the largest row', () => {
    const rows = zipRowsOf(tree, new Set(['Trip']));
    expect(rows.map((row) => [row.node.path, row.depth, row.open])).toEqual([
      ['Trip', 0, true],
      ['Trip/a.jpg', 1, false],
      ['Trip/b.jpg', 1, false],
      ['c.txt', 0, false],
    ]);
    expect(rows.map((row) => row.share)).toEqual([1, 0.75, 0.25, 0.5]);
  });

  it('toggles folders and opens a single top folder at first', () => {
    expect([...toggled(new Set(['a']), 'a')]).toEqual([]);
    expect([...toggled(new Set(), 'a')]).toEqual(['a']);
    expect([...firstExpanded(zipTreeOf([entry('Only/x.txt', 1)]))]).toEqual(['Only']);
    expect([...firstExpanded(tree)]).toEqual([]);
  });
});

describe('zipOpenOf', () => {
  it('opens images, media and text in the players and nothing else', () => {
    expect(zipOpenOf(entry('a.jpg', 1, { kind: 'image' }))).toBe('image');
    expect(zipOpenOf(entry('a.heic', 1, { kind: 'image' }))).toBe('none');
    expect(zipOpenOf(entry('a.mp4', 1, { kind: 'video' }))).toBe('video');
    expect(zipOpenOf(entry('a.mp3', 1, { kind: 'audio' }))).toBe('audio');
    expect(zipOpenOf(entry('a.md', 1, { kind: 'document' }))).toBe('text');
    expect(zipOpenOf(entry('a.pdf', 1, { kind: 'document' }))).toBe('none');
    expect(zipOpenOf(entry('inner.zip', 1))).toBe('none');
    expect(zipOpenOf(entry('secret.txt', 1, { kind: 'document', encrypted: true }))).toBe('locked');
  });
});

describe('archive summary', () => {
  it('writes the headline and the packed line', () => {
    const totals = { files: 1240, folders: 3, bytes: 4096, compressedBytes: 1024 };
    expect(zipHeadlineOf(totals)).toBe(
      `Archive · 1,240 files · 3 folders · ${bytes(4096)} unpacked`,
    );
    expect(packedLineOf(totals)).toBe(`${bytes(1024)} packed, 75% smaller`);
    expect(packedLineOf({ files: 1, folders: 0, bytes: 10, compressedBytes: 10 })).toBe(
      `${bytes(10)} packed, not compressed`,
    );
    expect(packedLineOf({ files: 0, folders: 0, bytes: 0, compressedBytes: 0 })).toBeNull();
  });

  it('splits the unpacked size by kind and drops empty kinds', () => {
    expect(
      zipSegmentsOf([
        entry('a.jpg', 30, { kind: 'image' }),
        entry('b.jpg', 10, { kind: 'image' }),
        entry('c.pdf', 5, { kind: 'document' }),
        entry('d/', 0),
      ]),
    ).toEqual([
      { label: 'Images', value: 40, colour: 'viz-1' },
      { label: 'Documents', value: 5, colour: 'viz-4' },
    ]);
  });

  it('knows a zip file by its type or its name', () => {
    const bin = { kind: 'other', name: 'x.bin', mime: 'application/octet-stream' } as const;
    expect(isZipNode({ ...bin, mime: 'application/zip' })).toBe(true);
    expect(isZipNode({ ...bin, kind: 'archive', mime: 'application/x-zip-compressed' })).toBe(true);
    expect(isZipNode({ ...bin, name: 'Photos.ZIP' })).toBe(true);
    expect(isZipNode({ ...bin, mime: null, name: 'Photos.zip' })).toBe(true);
    expect(isZipNode(bin)).toBe(false);
    expect(isZipNode({ kind: 'folder', name: 'Old.zip', mime: null })).toBe(false);
  });

  it('knows text files by their name', () => {
    expect(isTextName('notes.md')).toBe(true);
    expect(isTextName('build.LOG')).toBe(true);
    expect(isTextName('photo.jpg')).toBe(false);
    expect(isTextName('README')).toBe(false);
  });
});
