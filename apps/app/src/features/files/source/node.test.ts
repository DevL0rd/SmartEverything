import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import { nodeOfEntry } from './fixture-tree';
import {
  NO_MARKS,
  captionOf,
  detailLineOf,
  extensionOf,
  kindOfFile,
  kindOfMime,
  markListOf,
} from './node';

describe('node kinds', () => {
  it('reads the kind from the mime type first', () => {
    expect(kindOfMime('image/heic')).toBe('image');
    expect(kindOfMime('video/mp4')).toBe('video');
    expect(kindOfMime('audio/flac')).toBe('audio');
    expect(kindOfMime('application/zip')).toBe('archive');
    expect(kindOfMime('application/pdf')).toBe('document');
    expect(kindOfMime('text/markdown')).toBe('document');
    expect(
      kindOfMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe('document');
    expect(kindOfMime('application/octet-stream')).toBe('other');
  });

  it('falls back to the extension when the mime type says nothing', () => {
    expect(kindOfFile(null, 'Holiday.JPG')).toBe('image');
    expect(kindOfFile('application/octet-stream', 'backup.tar')).toBe('archive');
    expect(kindOfFile(null, 'README')).toBe('other');
    expect(kindOfFile('video/webm', 'clip.txt')).toBe('video');
    expect(extensionOf('.bashrc')).toBeNull();
    expect(extensionOf('a.')).toBeNull();
    expect(extensionOf('a.B')).toBe('b');
  });
});

describe('node marks and lines', () => {
  it('lists marks in order: star, shared, view only, shortcut, comments, placement, offline', () => {
    const marks = {
      ...NO_MARKS,
      starred: true,
      shared: true,
      locked: true,
      shortcut: { unavailable: null },
      comments: 2,
      placement: 'synced',
      offline: 'ready',
    } as const;
    expect(markListOf(marks).map((mark) => mark.key)).toEqual([
      'star',
      'shared',
      'locked',
      'shortcut',
      'comments',
      'placement',
      'offline',
    ]);
    expect(markListOf(marks).find((mark) => mark.key === 'comments')?.label).toBe(
      '2 open comments',
    );
    expect(markListOf(NO_MARKS)).toEqual([]);
  });

  it('captions folders by item count, files by size and broken shortcuts by the reason', () => {
    const folder = {
      ...nodeOfEntry({ key: 'd', parentKey: 'p', name: 'Docs', kind: 'folder' }),
      childCount: 1,
    };
    expect(captionOf(folder)).toBe('1 item');
    expect(captionOf({ ...folder, files: 1234, size: 2048 })).toBe(`1,234 files · ${bytes(2048)}`);
    expect(captionOf(nodeOfEntry({ key: 'f', parentKey: 'p', name: 'a.txt', size: 0 }))).toBe(
      bytes(0),
    );
    const broken = nodeOfEntry({
      key: 's',
      parentKey: 'p',
      name: 'gone',
      marks: { shortcut: { unavailable: 'In the Trash' } },
    });
    expect(captionOf(broken)).toBe('In the Trash');
    const link = nodeOfEntry({
      key: 'k',
      parentKey: 'p',
      name: 'latest',
      kind: 'link',
      entry: { line: 'Points to plan.pdf', stays: 'It stays on the drive.' },
    });
    expect(captionOf(link)).toBe('Points to plan.pdf');
    const locked = nodeOfEntry({
      key: 'l',
      parentKey: 'p',
      name: 'x.pdf',
      size: 0,
      writable: false,
      marks: { locked: true },
    });
    expect(detailLineOf(locked)).toContain('View only');
    expect(detailLineOf(locked)).toContain('Read only');
  });
});
