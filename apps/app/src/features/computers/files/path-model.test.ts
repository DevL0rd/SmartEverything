import { describe, expect, it } from 'vitest';
import type { FileEntry } from '@smarteverything/domain';
import {
  breadcrumbs,
  entryEnabled,
  isUsablePath,
  newFolderError,
  orderEntries,
} from './path-model';

function entry(name: string, kind: FileEntry['kind'] = 'file'): FileEntry {
  return {
    name,
    path: `/home/dana/${name}`,
    kind,
    size: 10,
    modifiedAt: '2026-10-15T10:00:00Z',
    hidden: name.startsWith('.'),
  };
}

describe('breadcrumbs', () => {
  it('keeps the whole computer one tap away and starts the home folder at Home', () => {
    expect(breadcrumbs('/home/dana/repo/apps', '/home/dana')).toEqual([
      { label: 'Computer', path: '/' },
      { label: 'Home', path: '/home/dana' },
      { label: 'repo', path: '/home/dana/repo' },
      { label: 'apps', path: '/home/dana/repo/apps' },
    ]);
  });

  it('is Computer then Home at the home folder itself', () => {
    expect(breadcrumbs('/home/dana', '/home/dana')).toEqual([
      { label: 'Computer', path: '/' },
      { label: 'Home', path: '/home/dana' },
    ]);
  });

  it('reaches the folders above home, other drives and system folders', () => {
    expect(breadcrumbs('/home', '/home/dana')).toEqual([
      { label: 'Computer', path: '/' },
      { label: 'home', path: '/home' },
    ]);
    expect(
      breadcrumbs('/run/media/dana/Backup/2026', '/home/dana').map((crumb) => crumb.path),
    ).toEqual([
      '/',
      '/run',
      '/run/media',
      '/run/media/dana',
      '/run/media/dana/Backup',
      '/run/media/dana/Backup/2026',
    ]);
  });

  it('treats a home folder of / as no special folder', () => {
    expect(breadcrumbs('/etc', '/')).toEqual([
      { label: 'Computer', path: '/' },
      { label: 'etc', path: '/etc' },
    ]);
  });

  it('starts at the computer root outside the home folder or before it is known', () => {
    const expected = [
      { label: 'Computer', path: '/' },
      { label: 'etc', path: '/etc' },
      { label: 'ssh', path: '/etc/ssh' },
    ];
    expect(breadcrumbs('/etc/ssh', '/home/dana')).toEqual(expected);
    expect(breadcrumbs('/etc/ssh', null)).toEqual(expected);
  });

  it('does not treat a sibling with the same prefix as inside home', () => {
    expect(breadcrumbs('/home/danaX/a', '/home/dana')[0]).toEqual({
      label: 'Computer',
      path: '/',
    });
  });

  it('is only the root at /', () => {
    expect(breadcrumbs('/', null)).toEqual([{ label: 'Computer', path: '/' }]);
  });
});

describe('orderEntries', () => {
  const entries = [
    entry('b.txt'),
    entry('.config', 'folder'),
    entry('file10'),
    entry('file2'),
    entry('Zeta', 'folder'),
    entry('alpha', 'folder'),
  ];

  it('puts folders first and sorts names naturally', () => {
    expect(orderEntries(entries, true).map((item) => item.name)).toEqual([
      '.config',
      'alpha',
      'Zeta',
      'b.txt',
      'file2',
      'file10',
    ]);
  });

  it('hides dot entries unless asked', () => {
    expect(orderEntries(entries, false).map((item) => item.name)).not.toContain('.config');
  });
});

describe('paths and rows', () => {
  it('accepts only absolute paths', () => {
    expect(isUsablePath('/home/dana')).toBe(true);
    expect(isUsablePath('~/repo')).toBe(false);
  });

  it('rejects folder names the workspace choice would refuse', () => {
    expect(newFolderError('/home/dana', 'notes')).toBeNull();
    expect(newFolderError('/home/dana', 'a/b')).not.toBeNull();
    expect(newFolderError('/home/dana', '..')).not.toBeNull();
    expect(newFolderError('/home/dana', '  ')).toBeNull();
  });

  it('lets folder mode open only folders and file mode open everything but special files', () => {
    expect(entryEnabled('folder', entry('a'))).toBe(false);
    expect(entryEnabled('folder', entry('d', 'folder'))).toBe(true);
    expect(entryEnabled('file', entry('a'))).toBe(true);
    expect(entryEnabled('file', entry('s', 'other'))).toBe(false);
  });
});
