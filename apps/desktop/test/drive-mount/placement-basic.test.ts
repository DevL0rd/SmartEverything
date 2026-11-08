import { describe, expect, it } from 'vitest';
import { CommandFailedError, type RunCommand } from '../../src/service/system.js';
import {
  basicFields,
  mountBasic,
  webClientFileLimit,
  type BasicFs,
  type BasicPorts,
  type BasicRequest,
} from '../../src/drive-mount/placement-basic.js';
import { probeTier, upgradeOffer } from '../../src/drive-mount/placement-tier.js';

type Reply = string | CommandFailedError | Error;

class Shell {
  readonly calls: string[] = [];
  readonly fsCalls: string[] = [];

  constructor(private readonly replies: Readonly<Record<string, Reply>>) {}

  readonly run: RunCommand = (file, args) => {
    const line = [file, ...args].join(' ');
    this.calls.push(line);
    const key = Object.keys(this.replies).find((prefix) => line.startsWith(prefix));
    const reply = key === undefined ? '' : this.replies[key];
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({ stdout: reply ?? '' });
  };

  readonly fs: BasicFs = {
    removeFolder: (folder) => {
      this.fsCalls.push(`rmdir ${folder}`);
      return Promise.resolve();
    },
    makeFolder: (folder) => {
      this.fsCalls.push(`mkdir ${folder}`);
      return Promise.resolve();
    },
    link: (target, at) => {
      this.fsCalls.push(`link ${target} ${at}`);
      return Promise.resolve();
    },
    unlink: (at) => {
      this.fsCalls.push(`unlink ${at}`);
      return Promise.resolve();
    },
  };

  ports(osRelease: string | null = null): BasicPorts {
    return { run: this.run, fs: this.fs, readText: () => Promise.resolve(osRelease) };
  }
}

function failure(exitCode: number): CommandFailedError {
  return new CommandFailedError('cmd', exitCode, 'exited', '');
}

const REQUEST: BasicRequest = {
  platform: 'linux',
  placementId: 'p1',
  davUrl: 'http://127.0.0.1:4000/grant1/',
  localPath: '/home/u/roms',
};

describe('probeTier', () => {
  it('is full on Linux with fuse3 and basic without', async () => {
    const present = new Shell({});
    const absent = new Shell({ fusermount3: failure(127) });
    expect(await probeTier('linux', present.ports())).toBe('full');
    expect(await probeTier('linux', absent.ports())).toBe('basic');
  });

  it('is full on Windows with WinFsp installed and basic without', async () => {
    const present = new Shell({});
    const absent = new Shell({ reg: failure(1) });
    expect(await probeTier('win32', present.ports())).toBe('full');
    expect(await probeTier('win32', absent.ports())).toBe('basic');
  });

  it('is basic on macOS without asking the system', async () => {
    const shell = new Shell({});
    expect(await probeTier('darwin', shell.ports())).toBe('basic');
    expect(shell.calls).toEqual([]);
  });

  it('does not hide an unexpected probe failure', async () => {
    const shell = new Shell({ fusermount3: new Error('spawn broke') });
    await expect(probeTier('linux', shell.ports())).rejects.toThrow('spawn broke');
  });
});

describe('upgradeOffer', () => {
  it('names the fuse3 command of the distribution', async () => {
    const shell = new Shell({});
    expect(await upgradeOffer('linux', shell.ports('ID=cachyos\nID_LIKE="arch"\n'))).toEqual({
      kind: 'fuse3',
      command: 'sudo pacman -S fuse3',
    });
    expect(
      await upgradeOffer('linux', shell.ports('ID=linuxmint\nID_LIKE="ubuntu debian"')),
    ).toEqual({
      kind: 'fuse3',
      command: 'sudo apt install fuse3',
    });
  });

  it('gives no command for an unknown distribution', async () => {
    const shell = new Shell({});
    expect(await upgradeOffer('linux', shell.ports('ID=plan9'))).toEqual({
      kind: 'fuse3',
      command: null,
    });
  });

  it('offers the WinFsp installer on Windows and nothing on macOS', async () => {
    const shell = new Shell({});
    expect(await upgradeOffer('win32', shell.ports())).toMatchObject({ kind: 'winfsp' });
    expect(await upgradeOffer('darwin', shell.ports())).toBeNull();
  });
});

describe('webClientFileLimit', () => {
  it('reads the registry value', async () => {
    const shell = new Shell({
      reg: '\n    FileSizeLimitInBytes    REG_DWORD    0xee6b280\n',
    });
    expect(await webClientFileLimit(shell.run)).toBe(250_000_000);
  });

  it('uses the 50 MB default when the value is absent', async () => {
    const shell = new Shell({ reg: failure(1) });
    expect(await webClientFileLimit(shell.run)).toBe(50_000_000);
  });

  it('fails on other registry errors', async () => {
    const shell = new Shell({ reg: failure(5) });
    await expect(webClientFileLimit(shell.run)).rejects.toThrow();
  });
});

describe('mountBasic on Linux', () => {
  const replies = {
    'gio info': 'uri: dav://x\nlocal path: /run/user/1000/gvfs/dav:host=127.0.0.1\n',
  };

  it('mounts through gio and links the path to the gvfs location', async () => {
    const shell = new Shell(replies);
    const mount = await mountBasic(shell.ports('ID=arch'), REQUEST);
    expect(shell.calls[0]).toBe('gio mount dav://127.0.0.1:4000/grant1/');
    expect(shell.fsCalls).toEqual([
      'rmdir /home/u/roms',
      'link /run/user/1000/gvfs/dav:host=127.0.0.1 /home/u/roms',
    ]);
    expect(mount.limits).toEqual({ maxFileBytes: null, wholeFileOpen: false, offline: false });
    expect(mount.offer).toEqual({ kind: 'fuse3', command: 'sudo pacman -S fuse3' });
    expect(basicFields(mount, 'local')).toMatchObject({
      state: 'mounted',
      tier: 'basic',
      route: 'local',
    });
  });

  it('unmounts by removing the link then the gio mount', async () => {
    const shell = new Shell(replies);
    const mount = await mountBasic(shell.ports(), REQUEST);
    await mount.unmount();
    expect(shell.fsCalls.at(-1)).toBe('unlink /home/u/roms');
    expect(shell.calls.at(-1)).toBe('gio mount -u dav://127.0.0.1:4000/grant1/');
  });

  it('fails when gio reports no local path', async () => {
    const shell = new Shell({ 'gio info': 'uri: dav://x\n' });
    await expect(mountBasic(shell.ports(), REQUEST)).rejects.toThrow('gio did not report');
  });
});

describe('mountBasic on macOS', () => {
  const request = { ...REQUEST, platform: 'darwin' } as const;

  it('mounts at the chosen path and reports whole file open', async () => {
    const shell = new Shell({});
    const mount = await mountBasic(shell.ports(), request);
    expect(shell.calls).toEqual(['mount_webdav -S http://127.0.0.1:4000/grant1/ /home/u/roms']);
    expect(shell.fsCalls).toEqual([]);
    expect(mount.limits.wholeFileOpen).toBe(true);
    expect(mount.limits.offline).toBe(false);
    expect(mount.offer).toBeNull();
    await mount.unmount();
    expect(shell.calls.at(-1)).toBe('umount /home/u/roms');
  });

  it('falls back to a Volumes mount linked at the path when the path is refused', async () => {
    const shell = new Shell({ 'mount_webdav -S http://127.0.0.1:4000/grant1/ /home': failure(1) });
    const mount = await mountBasic(shell.ports(), request);
    expect(shell.calls[1]).toBe(
      'mount_webdav -S http://127.0.0.1:4000/grant1/ /Volumes/SmartEverything-p1',
    );
    expect(shell.fsCalls).toEqual([
      'mkdir /Volumes/SmartEverything-p1',
      'rmdir /home/u/roms',
      'link /Volumes/SmartEverything-p1 /home/u/roms',
    ]);
    await mount.unmount();
    expect(shell.fsCalls.slice(-2)).toEqual([
      'unlink /home/u/roms',
      'rmdir /Volumes/SmartEverything-p1',
    ]);
    expect(shell.calls.at(-1)).toBe('umount /Volumes/SmartEverything-p1');
  });
});

describe('mountBasic on Windows', () => {
  const request = { ...REQUEST, platform: 'win32' } as const;
  const replies = {
    reg: '    FileSizeLimitInBytes    REG_DWORD    0xee6b280',
    'net use *': 'Drive z: is now connected to http://127.0.0.1:4000/grant1/.',
  };

  it('uses a drive letter without any link and reports the registry limit', async () => {
    const shell = new Shell(replies);
    const mount = await mountBasic(shell.ports(), request);
    expect(shell.fsCalls).toEqual([]);
    expect(mount.limits).toEqual({
      maxFileBytes: 250_000_000,
      wholeFileOpen: false,
      offline: false,
    });
    expect(mount.reason).toBe('Available as drive Z:');
    expect(mount.offer).toMatchObject({ kind: 'winfsp' });
    await mount.unmount();
    expect(shell.calls.at(-1)).toBe('net use z: /delete');
  });

  it('reports the 50 MB default when the limit was never set', async () => {
    const shell = new Shell({ ...replies, reg: failure(1) });
    const mount = await mountBasic(shell.ports(), request);
    expect(mount.limits.maxFileBytes).toBe(50_000_000);
  });
});

describe('mountBasic on unsupported platforms', () => {
  it('refuses a platform without a Basic tier', async () => {
    const shell = new Shell({});
    await expect(mountBasic(shell.ports(), { ...REQUEST, platform: 'freebsd' })).rejects.toThrow(
      'no Basic tier',
    );
  });
});
