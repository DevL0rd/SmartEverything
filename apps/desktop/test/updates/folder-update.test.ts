import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyFolderUpdate, type FolderUpdateOptions } from '../../src/updates/folder-update.js';

let base = '';
let root = '';

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'folder-update-'));
  root = join(base, 'SmartEverything');
  await mkdir(root);
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
    run: async (file, args) => {
      events.push(`run ${file}`);
      const destination = args.at(-1) ?? '';
      await mkdir(join(destination, 'SmartEverything-linux-x64'), { recursive: true });
      await writeFile(join(destination, 'SmartEverything-linux-x64', 'version'), 'new');
    },
    restartServices: async () => {
      events.push(`restart ${await readFile(join(root, 'version'), 'utf8')}`);
      await restart();
    },
    relaunch: (executable) => {
      events.push(`relaunch ${executable}`);
    },
  };
  return { options, events };
}

describe('applying a downloaded app folder', () => {
  it('swaps the folder, restarts the services on the new files and starts the new app', async () => {
    const { options, events } = rig();
    await applyFolderUpdate(options, '/tmp/app.zip');
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('new');
    expect(await readFile(join(base, 'SmartEverything.previous', 'version'), 'utf8')).toBe('old');
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
      'SmartEverything.previous',
    ]);
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
