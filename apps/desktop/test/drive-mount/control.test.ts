import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  type DesktopDriveCommand,
  type DesktopDriveState,
} from '@smarteverything/domain';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DriveControlClient,
  DriveControlRefusedError,
} from '../../src/drive-mount/control-client.js';
import { driveControlAddress } from '../../src/drive-mount/control-protocol.js';
import { DriveControlServer } from '../../src/drive-mount/control-server.js';

const log = new Logger('desktop.test');

function state(change: Partial<DesktopDriveState> = {}): DesktopDriveState {
  return {
    mount: null,
    sync: null,
    fuse: { available: true },
    firstRun: { pending: false, defaultParent: '/home/u/SmartEverything' },
    cache: DEFAULT_DESKTOP_DRIVE_CACHE,
    ...change,
  };
}

let folder = '';
let server: DriveControlServer | null = null;
let client: DriveControlClient | null = null;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'drive-control-'));
});

afterEach(async () => {
  client?.stop();
  await server?.stop();
  client = null;
  server = null;
  await rm(folder, { recursive: true, force: true });
});

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !check(); attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  expect(check()).toBe(true);
}

describe('drive control channel', () => {
  it('names a private socket in the data folder and a pipe on Windows', () => {
    expect(driveControlAddress('linux', '/data')).toBe('/data/drive-control.sock');
    expect(driveControlAddress('win32', 'C:\\data')).toMatch(
      /^\\\\\.\\pipe\\smarteverything-drive-/,
    );
  });

  it('serves state, runs commands and pushes changes', async () => {
    const commands: DesktopDriveCommand[] = [];
    let current = state();
    const listeners = new Set<() => void>();
    const address = driveControlAddress('linux', folder);
    server = new DriveControlServer({
      address,
      platform: 'linux',
      log,
      target: {
        state: (): Promise<DesktopDriveState> => Promise.resolve(current),
        run: (command): Promise<void> => {
          if (command.kind === 'pin') return Promise.reject(new Error('Pinning needs a mount'));
          commands.push(command);
          current = state({ mount: { status: 'Mounted', mounted: true } });
          return Promise.resolve();
        },
        onChange: (listener): (() => void) => {
          listeners.add(listener);
          return (): void => {
            listeners.delete(listener);
          };
        },
      },
    });
    await server.start();
    client = new DriveControlClient({ address, retryMs: 20, log });
    const seen = vi.fn();
    client.onState(seen);
    client.start();
    await until(() => client?.current !== null);
    expect(client.current).toEqual(state());

    expect(await client.state()).toEqual(state());
    const after = await client.run({ kind: 'again' });
    expect(commands).toEqual([{ kind: 'again' }]);
    expect(after.mount).toEqual({ status: 'Mounted', mounted: true });

    current = state({
      sync: { placements: 1, paused: false, needBytes: 0, pendingOps: 0, failures: 0 },
    });
    for (const listener of listeners) listener();
    await until(() => client?.current?.sync?.placements === 1);

    await expect(client.run({ kind: 'pin', mount: 'm', path: '/a' })).rejects.toThrow(
      DriveControlRefusedError,
    );
  });

  it('reports the service as unavailable and connects once it starts', async () => {
    const address = driveControlAddress('linux', folder);
    client = new DriveControlClient({ address, retryMs: 20, log });
    client.start();
    await expect(client.state()).rejects.toThrow(/not running/);
    server = new DriveControlServer({
      address,
      platform: 'linux',
      log,
      target: {
        state: (): Promise<DesktopDriveState> => Promise.resolve(state()),
        run: (): Promise<void> => Promise.resolve(),
        onChange: (): (() => void) => (): void => undefined,
      },
    });
    await server.start();
    await until(() => client?.current !== null);
    const lost = vi.fn();
    client.onState(lost);
    await server.stop();
    await until(() => lost.mock.calls.some((call) => call[0] === null));
    expect(client.current).toBeNull();
  });
});
