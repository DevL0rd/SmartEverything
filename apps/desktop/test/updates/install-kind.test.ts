import { describe, expect, it } from 'vitest';
import {
  installKindOf,
  type InstallFacts,
  type InstallProbe,
} from '../../src/updates/install-kind.js';

function probe(writable: readonly string[], existing: readonly string[] = []): InstallProbe {
  return {
    writable: (path) => Promise.resolve(writable.includes(path)),
    exists: (path) => Promise.resolve(existing.includes(path)),
  };
}

const LINUX: InstallFacts = {
  platform: 'linux',
  execPath: '/home/dev/.local/opt/SmartEverything/smarteverything',
  packaged: true,
};

describe('how this copy of the app was installed', () => {
  it('never replaces a development copy', async () => {
    const kind = await installKindOf({ ...LINUX, packaged: false }, probe([]));
    expect(kind).toStrictEqual({ kind: 'unmanaged', reason: 'This is a development copy.' });
  });

  it('replaces an unpacked Linux folder the person owns', async () => {
    const kind = await installKindOf(
      LINUX,
      probe(['/home/dev/.local/opt/SmartEverything', '/home/dev/.local/opt']),
    );
    expect(kind).toStrictEqual({ kind: 'folder', root: '/home/dev/.local/opt/SmartEverything' });
  });

  it('leaves a package-managed Linux install to the package manager', async () => {
    const kind = await installKindOf(
      { ...LINUX, execPath: '/opt/SmartEverything/smarteverything' },
      probe(['/opt/SmartEverything', '/opt']),
    );
    expect(kind.kind).toBe('unmanaged');
    expect(JSON.stringify(kind)).toContain('package');
  });

  it('leaves a folder alone when its parent cannot be written', async () => {
    const kind = await installKindOf(LINUX, probe(['/home/dev/.local/opt/SmartEverything']));
    expect(kind.kind).toBe('unmanaged');
  });

  it('replaces a Mac app bundle in a writable Applications folder', async () => {
    const kind = await installKindOf(
      {
        platform: 'darwin',
        execPath: '/Users/dev/Applications/SmartEverything.app/Contents/MacOS/SmartEverything',
        packaged: true,
      },
      probe(['/Users/dev/Applications']),
    );
    expect(kind).toStrictEqual({
      kind: 'bundle',
      root: '/Users/dev/Applications/SmartEverything.app',
    });
  });

  it('does not touch a Mac app in a folder the account cannot write', async () => {
    const kind = await installKindOf(
      {
        platform: 'darwin',
        execPath: '/Applications/SmartEverything.app/Contents/MacOS/SmartEverything',
        packaged: true,
      },
      probe([]),
    );
    expect(kind.kind).toBe('unmanaged');
  });

  it('uses Squirrel when the installer’s Update.exe sits next to the app folder', async () => {
    const execPath =
      'C:\\Users\\dev\\AppData\\Local\\smarteverything\\app-0.1.0\\smarteverything.exe';
    const update = 'C:\\Users\\dev\\AppData\\Local\\smarteverything\\Update.exe';
    expect(
      await installKindOf({ platform: 'win32', execPath, packaged: true }, probe([], [update])),
    ).toStrictEqual({
      kind: 'squirrel',
    });
    expect(
      (await installKindOf({ platform: 'win32', execPath, packaged: true }, probe([]))).kind,
    ).toBe('unmanaged');
  });

  it('offers nothing on other systems', async () => {
    const kind = await installKindOf({ ...LINUX, platform: 'freebsd' }, probe([]));
    expect(kind.kind).toBe('unmanaged');
  });
});
