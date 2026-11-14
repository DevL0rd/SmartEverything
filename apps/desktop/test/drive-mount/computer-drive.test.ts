import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DEFAULT_DESKTOP_DRIVE_CACHE, type DrivePlacement } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComputerDrive, type ComputerDriveContext } from '../../src/drive-mount/computer-drive.js';
import { DriveControlClient } from '../../src/drive-mount/control-client.js';
import { driveControlAddress } from '../../src/drive-mount/control-protocol.js';
import { syncedPlacement } from './placement-fixture.js';
import type { PlacementFeed } from '../../src/drive-mount/relay-link.js';

const log = new Logger('desktop.test');
const SCRATCH = resolve(import.meta.dirname, '../../../../tmp/drive-computer-drive-test');

class Feed implements PlacementFeed {
  readonly mountsDemanded = false;
  private listener: (placements: readonly DrivePlacement[]) => void = () => undefined;
  onPlacements = (listener: (placements: readonly DrivePlacement[]) => void): (() => void) => {
    this.listener = listener;
    return (): void => undefined;
  };
  onMountsDemand = (): (() => void) => (): void => undefined;
  report = (): void => undefined;
  push(placements: readonly DrivePlacement[]): void {
    this.listener(placements);
  }
}

let folder = '';
let drive: ComputerDrive | null = null;
let client: DriveControlClient | null = null;

beforeEach(async () => {
  await mkdir(SCRATCH, { recursive: true });
  folder = await mkdtemp(join(SCRATCH, 'run-'));
});

afterEach(async () => {
  client?.stop();
  await drive?.stop();
  client = null;
  drive = null;
  await rm(SCRATCH, { recursive: true, force: true });
});

function context(): ComputerDriveContext {
  return {
    layout: { root: join(folder, 'node'), driveMountCache: join(folder, 'node', 'drive-mounts') },
    node: { hub_url: 'https://hub.invalid', node_token: 'token' },
    transport: {
      fetch: (): Promise<Response> => Promise.reject(new Error('offline')),
      socket: (): never => {
        throw new Error('offline');
      },
      subscribe: (): (() => void) => (): void => undefined,
      ready: (): boolean => false,
    },
    authority: {
      state: { endpoint: null },
      view: { trust: null },
      subscribe: (): (() => void) => (): void => undefined,
    },
    log,
  };
}

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 300 && !check(); attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  expect(check()).toBe(true);
}

describe('ComputerDrive', () => {
  it('starts with the default cache settings and keeps the chosen ones across restarts', async () => {
    drive = new ComputerDrive(context());
    await drive.start();
    expect((await drive.state()).cache).toEqual(DEFAULT_DESKTOP_DRIVE_CACHE);
    const cache = {
      maxAgeSeconds: 7200,
      maxBytes: null,
      minFreeBytes: 10_000_000_000,
      cleanupSeconds: 60,
    };
    await drive.run({ kind: 'cache', cache });
    await drive.stop();
    drive = new ComputerDrive(context());
    await drive.start();
    expect((await drive.state()).cache).toEqual(cache);
  });

  it('runs a synced placement from the hub feed and answers the desktop over its control socket', async () => {
    drive = new ComputerDrive(context());
    await drive.start();
    const feed = new Feed();
    drive.attach(feed);
    client = new DriveControlClient({
      address: driveControlAddress(process.platform, join(folder, 'node')),
      retryMs: 20,
      log,
    });
    client.start();
    await until(() => client?.current !== null);
    expect(client.current?.sync).toBeNull();
    expect(client.current?.firstRun.pending).toBe(process.platform === 'linux');

    const target = join(folder, 'synced');
    feed.push([syncedPlacement(target)]);
    await until(() => client?.current?.sync?.placements === 1);
    expect((await stat(target)).isDirectory()).toBe(true);

    const paused = await client.run({ kind: 'sync-pause' });
    expect(paused.sync?.paused).toBe(true);
    const resumed = await client.run({ kind: 'sync-resume' });
    expect(resumed.sync?.paused).toBe(false);

    const settled = await client.run({ kind: 'first-run-dismissed' });
    expect(settled.firstRun.pending).toBe(false);

    const cache = {
      maxAgeSeconds: 600,
      maxBytes: 5_000_000_000,
      minFreeBytes: null,
      cleanupSeconds: 30,
    };
    expect((await client.run({ kind: 'cache', cache })).cache).toEqual(cache);

    feed.push([]);
    await until(() => client?.current?.sync === null);
  });
});
