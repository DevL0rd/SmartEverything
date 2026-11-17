import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DEFAULT_DESKTOP_DRIVE_TUNING,
  type DesktopDriveCommand,
  type DrivePlacement,
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
import type { FuseStatus } from '../../src/drive-mount/fuse-detect.js';
import {
  MountController,
  type HelperHandle,
  type MountPlacements,
} from '../../src/drive-mount/controller.js';
import { HelperProcess, type HelperChild } from '../../src/drive-mount/helper-process.js';
import { FIXTURE_ID, FIXTURE_STATUS, mountedPlacement } from './placement-fixture.js';
import type { MountTray } from '../../src/drive-mount/mount-state.js';
import type { LinkPort } from '../../src/drive-mount/placements.js';
import { driveControlAddress } from '../../src/drive-mount/control-protocol.js';
import { DriveControlServer } from '../../src/drive-mount/control-server.js';

const log = new Logger('desktop.test');

function state(change: Partial<DesktopDriveState> = {}): DesktopDriveState {
  return {
    mount: null,
    sync: null,
    fuse: { available: true },
    cache: DEFAULT_DESKTOP_DRIVE_CACHE,
    tuning: { saved: DEFAULT_DESKTOP_DRIVE_TUNING, applied: [], limits: null },
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
          current = state({ mount: { status: 'Mounted', mounted: true, points: [] } });
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
    expect(after.mount).toEqual({ status: 'Mounted', mounted: true, points: [] });

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

const MOUNT = {
  op: 'mount',
  mount: 'p1',
  root: 'r',
  folder: 'f',
  point: '/home/u/Drive',
} as const;

class FakeChild implements HelperChild {
  readonly written: string[] = [];
  private exit: (reason: string) => void = () => undefined;
  ended = false;
  stdout: ((line: string) => void) | null = null;
  stderr: ((line: string) => void) | null = null;

  writeControl(line: string): void {
    this.written.push(line);
  }
  endControl(): void {
    this.ended = true;
    this.exit('The mount helper stopped (exit code 0)');
  }
  sendToken(): Promise<void> {
    return Promise.resolve();
  }
  onStdout(listener: (line: string) => void): void {
    this.stdout = listener;
  }
  onStderr(listener: (line: string) => void): void {
    this.stderr = listener;
  }
  onExit(listener: (reason: string) => void): void {
    this.exit = listener;
  }
  kill(): void {
    this.ended = true;
  }
  die(reason: string): void {
    this.exit(reason);
  }
}

function helperProcess(): { helper: HelperProcess; children: FakeChild[] } {
  const children: FakeChild[] = [];
  const helper = new HelperProcess(
    {
      binary: 'helper',
      cacheDirectory: '/cache',
      token: (): Promise<string> => Promise.resolve('t'),
      spawn: (): HelperChild => {
        const child = new FakeChild();
        children.push(child);
        return child;
      },
    },
    log,
  );
  return { helper, children };
}

describe('mount helper process', () => {
  it('reports its mounts failed on a crash and replays them on restart', async () => {
    const { helper, children } = helperProcess();
    const lines: string[] = [];
    helper.onLine((raw) => lines.push(raw));
    const crashes: string[] = [];
    helper.onCrash((reason) => crashes.push(reason));
    helper.send(MOUNT);
    await until(() => children[0]?.written.length === 1);
    children[0]?.die('The mount helper stopped (SIGKILL)');
    expect(crashes).toEqual(['The mount helper stopped (SIGKILL)']);
    expect(lines.map((raw): unknown => JSON.parse(raw))).toEqual([
      {
        type: 'status',
        mount: 'p1',
        state: 'failed',
        reason: 'The mount helper stopped (SIGKILL)',
        readOnly: false,
      },
    ]);
    helper.restart();
    await until(() => children.length === 2 && children[1]?.written.length === 1);
    const replayed: unknown = JSON.parse(children[1]?.written[0] ?? '');
    expect(replayed).toEqual(MOUNT);
  });

  it('sends the saved tuning to every helper it starts', async () => {
    const { helper, children } = helperProcess();
    const line = { op: 'tuning', tuning: { maxBackground: 64 } } as const;
    helper.configure(line);
    helper.send(MOUNT);
    await until(() => children[0]?.written.length === 2);
    expect(children[0]?.written.map((raw): unknown => JSON.parse(raw))).toEqual([line, MOUNT]);
    helper.configure({ op: 'tuning', tuning: { maxBackground: 128 } });
    expect(children[0]?.written.map((raw): unknown => JSON.parse(raw))[2]).toEqual({
      op: 'tuning',
      tuning: { maxBackground: 128 },
    });
  });

  it('does not replay a mount that was unmounted and does not call a clean close a crash', async () => {
    const { helper, children } = helperProcess();
    const crashes = vi.fn();
    helper.onCrash(crashes);
    helper.send(MOUNT);
    helper.send({ op: 'unmount', mount: 'p1' });
    await until(() => children[0]?.written.length === 2);
    await helper.close();
    expect(crashes).not.toHaveBeenCalled();
    helper.restart();
    await Promise.resolve();
    expect(children).toHaveLength(1);
  });
});

describe('mount controller', () => {
  function build(points: string[] = ['/mnt/a']): {
    controller: MountController;
    helper: HelperHandle & { crash: () => void; pushLine: (raw: string) => void };
    recovered: string[];
    restarts: number[];
    tray: (MountTray | null)[];
    tuned: number[];
    sleeps: number[];
    links: LinkPort[];
  } {
    const recovered: string[] = [];
    const restarts: number[] = [];
    const tray: (MountTray | null)[] = [];
    const tuned: number[] = [];
    const sleeps: number[] = [];
    const links: LinkPort[] = [];
    const crashListeners = new Set<(reason: string) => void>();
    const lineListeners = new Set<(raw: string) => void>();
    const helper = {
      send: (): void => undefined,
      close: (): Promise<void> => Promise.resolve(),
      configure: (): void => undefined,
      onLine: (listener: (raw: string) => void): (() => void) => {
        lineListeners.add(listener);
        return (): void => {
          lineListeners.delete(listener);
        };
      },
      onCrash: (listener: (reason: string) => void): (() => void) => {
        crashListeners.add(listener);
        return (): void => {
          crashListeners.delete(listener);
        };
      },
      restart: (): void => {
        restarts.push(recovered.length);
      },
      crash: (): void => {
        for (const listener of crashListeners) listener('killed');
      },
      pushLine: (raw: string): void => {
        for (const listener of lineListeners) listener(raw);
      },
    };
    const controller = new MountController({
      fuse: (): Promise<FuseStatus> => Promise.resolve({ available: true }),
      recover: (point): Promise<boolean> => {
        recovered.push(point);
        return Promise.resolve(true);
      },
      stalePoints: (): Promise<readonly string[]> => Promise.resolve(points),
      known: (): readonly DrivePlacement[] => [mountedPlacement()],
      helper,
      link: {
        onPlacements: (): (() => void) => (): void => undefined,
        onMountsDemand: (): (() => void) => (): void => undefined,
        mountsDemanded: (): boolean => false,
        report: (): void => undefined,
      },
      createPlacements: (ports): MountPlacements => {
        links.push(ports.link);
        return { start: (): void => undefined, stop: (): void => undefined };
      },
      clearCache: (): Promise<void> => Promise.resolve(),
      sleep: (milliseconds): Promise<void> => {
        sleeps.push(milliseconds);
        return Promise.resolve();
      },
      tray: (state): void => {
        tray.push(state);
      },
      tuningChanged: (): void => {
        tuned.push(tuned.length);
      },
      log,
    });
    return { controller, helper, recovered, restarts, tray, tuned, sleeps, links };
  }

  it('cleans stale points on start and again before restarting a crashed helper', async () => {
    const { controller, helper, recovered, restarts, sleeps } = build();
    await controller.start();
    expect(recovered).toEqual(['/mnt/a']);
    helper.crash();
    await until(() => restarts.length === 1);
    expect(recovered).toEqual(['/mnt/a', '/mnt/a']);
    expect(restarts).toEqual([2]);
    expect(sleeps).toEqual([1000]);
  });

  it('backs off repeated crashes and starts over once a mount comes up', async () => {
    const { controller, helper, restarts, sleeps } = build();
    await controller.start();
    helper.crash();
    await until(() => restarts.length === 1);
    helper.crash();
    await until(() => restarts.length === 2);
    helper.pushLine(
      JSON.stringify({ type: 'status', mount: FIXTURE_ID, state: 'mounted', readOnly: false }),
    );
    helper.crash();
    await until(() => restarts.length === 3);
    expect(sleeps).toEqual([1000, 2000, 1000]);
  });

  it('shows journal replay as pending uploads in the tray status', async () => {
    const { controller, helper, tray, links } = build();
    await controller.start();
    links[0]?.report({
      ...FIXTURE_STATUS,
      placementId: FIXTURE_ID,
      state: 'mounted',
      tier: 'full',
      route: 'local',
      mountPoint: '/home/u/Drive',
    });
    const counters = (pendingUploads: number): string =>
      JSON.stringify({
        type: 'counters',
        mount: FIXTURE_ID,
        cacheBytes: 0,
        pinnedBytes: 0,
        openFiles: 0,
        pendingUploads,
      });
    helper.pushLine(counters(3));
    helper.pushLine(counters(1));
    helper.pushLine(counters(0));
    expect(tray.map((state) => state?.status)).toEqual([
      'Mounted',
      'Mounted · 3 uploads pending',
      'Mounted · 1 upload pending',
      'Mounted',
    ]);
  });

  it('names the reason a mount failed in the tray status', async () => {
    const { controller, tray, links } = build();
    await controller.start();
    links[0]?.report({
      ...FIXTURE_STATUS,
      placementId: FIXTURE_ID,
      state: 'failed',
      tier: 'full',
      route: 'local',
      reason: 'fusermount3: mount failed: Operation not permitted',
    });
    expect(tray.at(-1)).toEqual({
      status: 'Mount failed: fusermount3: mount failed: Operation not permitted',
      mounted: false,
      points: [],
    });
  });

  const LIMITS = {
    type: 'limits',
    platform: 'linux',
    kernel: true,
    maxUserBgreq: 20_793,
    maxUserCongThresh: 15_594,
    maxPagesLimit: 256,
    pageSize: 4096,
    readaheadOffer: 131_072,
    maxRequestBytes: 1_048_576,
  };

  function applied(openFiles: number): string {
    return JSON.stringify({
      type: 'applied',
      mount: FIXTURE_ID,
      platform: 'linux',
      remount: {
        maxBackground: 64,
        congestionThreshold: 48,
        maxRequestBytes: 1_048_576,
        kernelReadaheadBytes: 131_072,
        asyncRead: true,
        writebackCache: true,
        readdirPlus: 'auto',
        parallelDirops: true,
      },
      live: {
        readAheadBytes: openFiles,
        entrySeconds: 'untilChanged',
        attrSeconds: 60,
        negativeSeconds: 'untilChanged',
        closeWaitsForUpload: false,
        uploadDelaySeconds: 0,
        fsyncWaitsForHub: true,
        uploadFiles: 4,
        uploadFramesInFlight: 64,
        pingSeconds: 10,
        deadAfterSeconds: 30,
        bulkFrameBytes: 1_048_576,
        prefetchSmallFiles: false,
      },
    });
  }

  it('folds the helper limits and applied values into the tuning state and announces them', async () => {
    const { controller, helper, tuned } = build();
    await controller.start();
    expect(controller.tuning(DEFAULT_DESKTOP_DRIVE_TUNING).limits).toBeNull();
    helper.pushLine(JSON.stringify(LIMITS));
    helper.pushLine(applied(7));
    expect(tuned.length).toBeGreaterThanOrEqual(2);
    const folded = controller.tuning(DEFAULT_DESKTOP_DRIVE_TUNING);
    expect(folded.limits).toEqual({
      platform: 'linux',
      pageBytes: 4096,
      maxUserBackground: 20_793,
      maxUserCongestionThreshold: 15_594,
      maxRequestBytes: 1_048_576,
      kernelReadaheadOfferBytes: 131_072,
    });
    expect(folded.applied).toEqual([
      {
        placementId: FIXTURE_ID,
        tuning: {
          ...DEFAULT_DESKTOP_DRIVE_TUNING,
          congestionThreshold: 48,
          readAheadBytes: 7,
          attrSeconds: 60,
        },
      },
    ]);
    helper.pushLine(
      JSON.stringify({ type: 'status', mount: FIXTURE_ID, state: 'stopped', readOnly: false }),
    );
    expect(controller.tuning(DEFAULT_DESKTOP_DRIVE_TUNING).applied).toEqual([]);
  });

  it('remounts only while the mount reports no open files', async () => {
    const { controller, helper, links } = build();
    await controller.start();
    links[0]?.report({
      ...FIXTURE_STATUS,
      placementId: FIXTURE_ID,
      state: 'mounted',
      tier: 'full',
      route: 'local',
      mountPoint: '/home/u/Drive',
    });
    const counters = (openFiles: number): string =>
      JSON.stringify({
        type: 'counters',
        mount: FIXTURE_ID,
        cacheBytes: 0,
        pinnedBytes: 0,
        openFiles,
        pendingUploads: 0,
      });
    helper.pushLine(counters(2));
    await expect(controller.run({ kind: 'remount' })).rejects.toThrow(
      'The mount cannot restart while 2 files are open',
    );
    helper.pushLine(counters(0));
    await controller.run({ kind: 'remount' });
    expect(links).toHaveLength(2);
  });

  it('does not restart a helper after the mount was stopped', async () => {
    const { controller, helper, restarts } = build();
    await controller.start();
    await controller.stop();
    helper.crash();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(restarts).toEqual([]);
  });
});
