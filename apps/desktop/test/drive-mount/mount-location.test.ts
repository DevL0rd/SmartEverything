import { describe, expect, it } from 'vitest';
import {
  MountLetterExhaustedError,
  MountLocations,
  MountNameInvalidError,
  folderNameOf,
  mountAreaOf,
  runtimeDirectoryOf,
} from '../../src/drive-mount/mount-location.js';
import type { FolderState, PathFs } from '../../src/drive-mount/placement-paths.js';

function memoryFs(folders: Map<string, FolderState>): PathFs {
  return {
    inspect: (folder) => Promise.resolve(folders.get(folder) ?? 'absent'),
    create: (folder): Promise<void> => {
      folders.set(folder, []);
      return Promise.resolve();
    },
  };
}

function locations(
  platform: NodeJS.Platform,
  folders = new Map<string, FolderState>(),
  usedLetters: readonly string[] = [],
): MountLocations {
  return new MountLocations(
    { platform, runtimeDirectory: '/run/user/1000' },
    {
      fs: memoryFs(folders),
      letterInUse: (letter) => Promise.resolve(usedLetters.includes(letter)),
    },
  );
}

describe('the standard mount place', () => {
  it('uses the runtime folder on Linux, /Volumes on macOS and drive letters on Windows', () => {
    expect(mountAreaOf({ platform: 'linux', runtimeDirectory: '/run/user/1000' })).toBe(
      '/run/user/1000/smarteverything',
    );
    expect(mountAreaOf({ platform: 'darwin', runtimeDirectory: '/run/user/501' })).toBe('/Volumes');
    expect(mountAreaOf({ platform: 'win32', runtimeDirectory: '/run/user/0' })).toBeNull();
  });

  it('reads XDG_RUNTIME_DIR and falls back to /run/user/<uid>', () => {
    expect(runtimeDirectoryOf({ XDG_RUNTIME_DIR: '/run/user/1234' }, 1000)).toBe('/run/user/1234');
    expect(runtimeDirectoryOf({ XDG_RUNTIME_DIR: 'relative' }, 1000)).toBe('/run/user/1000');
    expect(runtimeDirectoryOf({}, 1000)).toBe('/run/user/1000');
  });

  it('makes a drive name safe as one folder name', () => {
    expect(folderNameOf(' My Drive ')).toBe('My Drive');
    expect(folderNameOf('a/b\\c:d')).toBe('a-b-c-d');
    expect(() => folderNameOf('..')).toThrow(MountNameInvalidError);
    expect(() => folderNameOf('   ')).toThrow(MountNameInvalidError);
  });

  it('skips taken and non-empty names and reuses an empty folder', async () => {
    const folders = new Map<string, FolderState>([
      ['/run/user/1000/smarteverything/Photos', ['x']],
      ['/run/user/1000/smarteverything/Photos 2', []],
    ]);
    const linux = locations('linux', folders);
    expect(await linux.assign('Photos', [])).toBe('/run/user/1000/smarteverything/Photos 2');
    expect(await linux.assign('Photos', ['/run/user/1000/smarteverything/Photos 2'])).toBe(
      '/run/user/1000/smarteverything/Photos 3',
    );
  });

  it('compares names without case on macOS', async () => {
    expect(await locations('darwin').assign('photos', ['/Volumes/Photos'])).toBe(
      '/Volumes/photos 2',
    );
  });

  it('creates the folder on Linux only', async () => {
    const folders = new Map<string, FolderState>();
    await locations('linux', folders).prepare('/run/user/1000/smarteverything/A');
    await locations('darwin', folders).prepare('/Volumes/A');
    expect([...folders.keys()]).toEqual(['/run/user/1000/smarteverything/A']);
  });

  it('takes the first free drive letter from Z down on Windows', async () => {
    expect(await locations('win32').assign('Photos', [])).toBe('Z:');
    expect(await locations('win32', new Map(), ['Z', 'Y']).assign('Photos', ['x:'])).toBe('W:');
    const all = Array.from({ length: 23 }, (_, n) => String.fromCharCode(90 - n));
    await expect(locations('win32', new Map(), all).assign('Photos', [])).rejects.toThrow(
      MountLetterExhaustedError,
    );
  });
});
