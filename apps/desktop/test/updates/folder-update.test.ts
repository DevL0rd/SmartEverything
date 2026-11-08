import type { promises } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_PACKAGE_RESOURCES } from '../../src/package-layout.js';
import {
  applyFolderUpdate,
  confirmBoot,
  installRootOf,
  reviewBoot,
  type FolderUpdateOptions,
} from '../../src/updates/folder-update.js';

let base = '';
let root = '';
const WAKE_VOCABULARY = 'computer/wake-name-model/bpe.vocab';
const ORIGINAL_FS_FIXTURE = `data:text/javascript,${encodeURIComponent(
  'import files from "node:fs/promises"; export const promises = { ...files };',
)}`;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'folder-update-'));
  root = join(base, 'SmartEverything');
  await writeComputer(root);
  await writeFile(join(root, 'version'), 'old');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

interface Rig {
  readonly options: FolderUpdateOptions;
  readonly events: string[];
}

function rig(restart: () => Promise<void> = () => Promise.resolve()): Rig {
  const events: string[] = [];
  const options: FolderUpdateOptions = {
    platform: 'linux',
    root,
    executable: 'smarteverything',
    version: '0.4.2',
    run: async (file, args) => {
      events.push(`run ${file}`);
      const destination = args.at(-1) ?? '';
      await writeComputer(join(destination, 'SmartEverything-linux-x64'));
      await writeFile(join(destination, 'SmartEverything-linux-x64', 'version'), 'new');
    },
    verifyCandidate: () => Promise.resolve(),
    prepareComputerRestart: () =>
      Promise.resolve(async () => {
        events.push(`restart ${await readFile(join(root, 'version'), 'utf8')}`);
        await restart();
      }),
    relaunch: (executable) => {
      events.push(`relaunch ${executable}`);
      return Promise.resolve();
    },
  };
  return { options, events };
}

async function writeComputer(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'smarteverything'), 'desktop executable');
  for (const entry of DESKTOP_PACKAGE_RESOURCES) {
    const file = join(directory, 'resources', entry);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, 'desktop package resource');
  }
}

async function withElectronFilesystem(
  check: (files: typeof promises) => Promise<void>,
): Promise<void> {
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      return specifier === 'node:original-fs'
        ? { url: ORIGINAL_FS_FIXTURE, shortCircuit: true }
        : nextResolve(specifier, context);
    },
  });
  Object.defineProperty(process.versions, 'electron', { value: 'test', configurable: true });
  try {
    const { promises } = await import('node:original-fs');
    await check(promises);
  } finally {
    Reflect.deleteProperty(process.versions, 'electron');
    hooks.deregister();
  }
}

describe('applying a downloaded app folder', () => {
  it('swaps the folder, restarts the services on the new files and starts the new app', async () => {
    const { options, events } = rig();
    await applyFolderUpdate(options, '/tmp/app.zip');
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('new');
    expect(await readFile(join(base, 'SmartEverything.rollback', 'version'), 'utf8')).toBe('old');
    expect(events).toStrictEqual([
      'run unzip',
      'restart new',
      `relaunch ${join(root, 'smarteverything')}`,
    ]);
  });

  it('repairs an installed app missing the wake vocabulary', async () => {
    const vocabulary = join(root, 'resources', WAKE_VOCABULARY);
    await rm(vocabulary);
    await applyFolderUpdate(rig().options, '/tmp/app.zip');
    expect(await readFile(vocabulary, 'utf8')).toBe('desktop package resource');
  });

  it('keeps the running app when the candidate lacks the wake vocabulary', async () => {
    const { options, events } = rig();
    const incomplete: FolderUpdateOptions = {
      ...options,
      run: async (file, args) => {
        await options.run(file, args);
        await rm(
          join(args.at(-1) ?? '', 'SmartEverything-linux-x64', 'resources', WAKE_VOCABULARY),
        );
      },
    };
    await expect(applyFolderUpdate(incomplete, '/tmp/app.zip')).rejects.toThrow(WAKE_VOCABULARY);
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
    expect(events).toStrictEqual(['run unzip']);
  });

  it('replaces a nonempty Electron backup through the original filesystem', async () => {
    const { options, events } = rig();
    const previous = `${root}.previous`;
    const rollback = `${root}.rollback`;
    const resources = join(previous, 'resources');
    await mkdir(resources, { recursive: true });
    await writeFile(join(resources, 'app.asar'), 'stale desktop archive');
    const hubInstall = join(base, 'SmartEverything-Hub');
    await mkdir(hubInstall);
    await writeFile(join(hubInstall, 'service.mjs'), 'dedicated hub');

    await withElectronFilesystem(async (files) => {
      const remove = vi.spyOn(files, 'rm');
      try {
        await applyFolderUpdate(options, '/tmp/app.zip');
        expect(remove).toHaveBeenCalledWith(previous, { recursive: true, force: true });
      } finally {
        remove.mockRestore();
      }
    });

    expect((await readdir(rollback)).sort()).toStrictEqual([
      'resources',
      'smarteverything',
      'version',
    ]);
    expect(await readFile(join(rollback, 'version'), 'utf8')).toBe('old');
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('new');
    expect(await readFile(join(hubInstall, 'service.mjs'), 'utf8')).toBe('dedicated hub');
    expect(events).toStrictEqual([
      'run unzip',
      'restart new',
      `relaunch ${join(root, 'smarteverything')}`,
    ]);
  });

  it('leaves no unpacking folders behind', async () => {
    await applyFolderUpdate(rig().options, '/tmp/app.zip');
    expect((await readdir(base)).sort()).toStrictEqual([
      'SmartEverything',
      'SmartEverything.boot',
      'SmartEverything.rollback',
    ]);
  });

  it('keeps the running app and can retry after clearing a blocked backup', async () => {
    const { options, events } = rig();
    const previous = `${root}.rollback`;
    const blocked = new Error(`EACCES: permission denied, rmdir '${previous}'`);
    await withElectronFilesystem(async (files) => {
      const remove = vi
        .spyOn(files, 'rm')
        .mockImplementation((path, options) =>
          path === previous ? Promise.reject(blocked) : rm(path, options),
        );
      try {
        await expect(applyFolderUpdate(options, '/tmp/app.zip')).rejects.toMatchObject({
          name: 'UpdateCleanupError',
          cause: blocked,
        });
        expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
        expect(events).toStrictEqual(['run unzip', 'restart old']);
      } finally {
        remove.mockRestore();
      }

      await applyFolderUpdate(options, '/tmp/app.zip');
      expect(await readFile(join(root, 'version'), 'utf8')).toBe('new');
    });
  });

  it('rejects a central Hub in either desktop folder before replacing the app', async () => {
    const { options, events } = rig();
    const originalRun = options.run;
    const combined: FolderUpdateOptions = {
      ...options,
      run: async (file, args) => {
        await originalRun(file, args);
        await mkdir(join(args.at(-1) ?? '', 'SmartEverything-linux-x64', 'resources', 'service'));
      },
    };
    await expect(applyFolderUpdate(combined, '/tmp/app.zip')).rejects.toThrow('central Hub');
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
    await mkdir(join(root, 'resources', 'service'));
    await expect(applyFolderUpdate(options, '/tmp/app.zip')).rejects.toThrow('central Hub');
    expect(events).toStrictEqual(['run unzip']);
  });

  it('keeps the old desktop if the candidate cannot cold boot at the offered version', async () => {
    const { options, events } = rig();
    const broken: FolderUpdateOptions = {
      ...options,
      verifyCandidate: (_executable, _profile, version) => {
        expect(version).toBe('0.4.2');
        return Promise.reject(new Error('desktop probe failed'));
      },
    };
    await expect(applyFolderUpdate(broken, '/tmp/app.zip')).rejects.toThrow('desktop probe failed');
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
    expect(events).toStrictEqual(['run unzip']);
  });

  it('goes back to the old folder when the services will not restart on the new one', async () => {
    let attempts = 0;
    const { options, events } = rig(() => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error('unit failed')) : Promise.resolve();
    });
    await expect(applyFolderUpdate(options, '/tmp/app.zip')).rejects.toThrow('unit failed');
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
    expect(events).toStrictEqual(['run unzip', 'restart new', 'restart old']);
  });

  it('keeps the old app when the download holds no app folder', async () => {
    const { options } = rig();
    const empty: FolderUpdateOptions = {
      ...options,
      run: async (_file, args) => {
        await mkdir(args.at(-1) ?? '', { recursive: true });
      },
    };
    await expect(applyFolderUpdate(empty, '/tmp/app.zip')).rejects.toThrow(/found nothing/u);
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
  });
});

describe('recovering from a failed relaunch', () => {
  it('swaps the old app back when the relaunch fails and reports the failure', async () => {
    const { options, events } = rig();
    const failing: FolderUpdateOptions = {
      ...options,
      relaunch: () => Promise.reject(new Error('the app would not quit')),
    };
    await expect(applyFolderUpdate(failing, '/tmp/app.zip')).rejects.toThrow(
      'the app would not quit',
    );
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
    expect(events).toStrictEqual(['run unzip', 'restart new', 'restart old']);
    expect((await readdir(base)).sort()).toStrictEqual(['SmartEverything']);
  });
});

describe('confirming the first start of an updated app', () => {
  it('keeps the old app until the new one confirms, then removes the rollback copy', async () => {
    await applyFolderUpdate(rig().options, '/tmp/app.zip');
    expect(await reviewBoot(root, '0.4.2', true)).toBe('confirming');
    expect(await readFile(join(`${root}.rollback`, 'version'), 'utf8')).toBe('old');
    await confirmBoot(root);
    expect((await readdir(base)).sort()).toStrictEqual(['SmartEverything']);
    expect(await reviewBoot(root, '0.4.2', false)).toBe('none');
  });

  it('swaps back to the old app when a later start finds the update unconfirmed', async () => {
    await applyFolderUpdate(rig().options, '/tmp/app.zip');
    expect(await reviewBoot(root, '0.4.2', false)).toBe('rolled-back');
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
    expect((await readdir(base)).sort()).toStrictEqual(['SmartEverything']);
    expect(await reviewBoot(root, '0.1.0', false)).toBe('none');
  });

  it('discards a marker that belongs to a different version', async () => {
    await applyFolderUpdate(rig().options, '/tmp/app.zip');
    expect(await reviewBoot(root, '0.9.0', false)).toBe('none');
    expect((await readdir(base)).sort()).toStrictEqual(['SmartEverything']);
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('new');
  });

  it('does nothing when no update was applied', async () => {
    expect(await reviewBoot(root, '0.1.0', false)).toBe('none');
  });
});

describe('finding the install folder', () => {
  it('is the executable folder on Linux and the app bundle on macOS', () => {
    expect(installRootOf('linux', '/opt/SmartEverything/smarteverything')).toBe(
      '/opt/SmartEverything',
    );
    expect(installRootOf('darwin', '/Applications/SmartEverything.app/Contents/MacOS/x')).toBe(
      '/Applications/SmartEverything.app',
    );
    expect(installRootOf('win32', 'C:\\app.exe')).toBeNull();
  });
});
