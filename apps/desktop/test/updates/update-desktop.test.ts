import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUpdates, type DesktopUpdatePorts } from '../../src/updates/update-desktop.js';

const ZIP = Buffer.from('the zipped new app');

let base = '';
let root = '';

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'update-desktop-'));
  root = join(base, 'opt', 'SmartEverything');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'smarteverything'), 'old executable');
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

function offer(): unknown {
  return {
    version: '0.4.2',
    artifacts: [
      {
        platform: 'linux',
        arch: 'x64',
        kind: 'zip',
        file: 'app.zip',
        sha256: createHash('sha256').update(ZIP).digest('hex'),
        size: ZIP.length,
        url: '/media/machine-updates/app.zip?expires=1&signature=ab',
      },
    ],
    expiresAt: '2026-10-18T10:10:00.000Z',
  };
}

interface Rig {
  readonly ports: DesktopUpdatePorts;
  readonly events: string[];
}

function rig(overrides: Partial<DesktopUpdatePorts> = {}): Rig {
  const events: string[] = [];
  const ports: DesktopUpdatePorts = {
    version: '0.1.0',
    packaged: true,
    execPath: join(root, 'smarteverything'),
    platform: 'linux',
    arch: 'x64',
    userDataPath: join(base, 'user-data'),
    server: () => Promise.resolve({ url: 'https://home.example:7880', token: 'set_token' }),
    fetch: (input) =>
      Promise.resolve(
        (input instanceof Request ? input.url : input.toString()).includes('/api/machine-update')
          ? Response.json(offer())
          : new Response(ZIP),
      ),
    run: async (file, args) => {
      events.push(`run ${file}`);
      const destination = args.at(-1) ?? '';
      await mkdir(join(destination, 'SmartEverything-linux-x64'), { recursive: true });
      await writeFile(
        join(destination, 'SmartEverything-linux-x64', 'smarteverything'),
        'new executable',
      );
    },
    restartServices: () => {
      events.push('restart services');
      return Promise.resolve();
    },
    relaunch: (executable) => {
      events.push(`relaunch ${executable}`);
    },
    squirrel: {
      setFeedURL: (): void => undefined,
      checkForUpdates: (): void => undefined,
      quitAndInstall: (): void => undefined,
      onceDownloaded: (): void => undefined,
      onceNotAvailable: (): void => undefined,
      onceFailed: (): void => undefined,
    },
    ...overrides,
  };
  return { ports, events };
}

describe('the update flow of the desktop app', () => {
  it('downloads, unpacks, swaps the folder, restarts the services and relaunches', async () => {
    const { ports, events } = rig();
    const updates = await createUpdates(ports);
    await updates.check();
    expect(updates.status()).toMatchObject({ state: 'available', installable: true });
    await updates.install();
    expect(await readFile(join(root, 'smarteverything'), 'utf8')).toBe('new executable');
    expect(await readFile(join(`${root}.previous`, 'smarteverything'), 'utf8')).toBe(
      'old executable',
    );
    expect(events).toStrictEqual([
      'run unzip',
      'restart services',
      `relaunch ${join(root, 'smarteverything')}`,
    ]);
    expect(await readFile(join(base, 'user-data', 'updates', '0.4.2', 'app.zip'))).toStrictEqual(
      ZIP,
    );
  });

  it('offers the release but refuses to install it over a development copy', async () => {
    const { ports } = rig({ packaged: false });
    const updates = await createUpdates(ports);
    expect(await updates.check()).toMatchObject({
      state: 'available',
      installable: false,
      detail: 'Version 0.4.2 is available. This is a development copy.',
    });
  });

  it('leaves a package-managed copy to the package manager', async () => {
    const { ports } = rig({ execPath: '/opt/SmartEverything/smarteverything' });
    const updates = await createUpdates(ports);
    expect((await updates.check()).installable).toBe(false);
  });
});
