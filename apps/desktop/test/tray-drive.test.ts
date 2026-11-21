import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DEFAULT_DESKTOP_DRIVE_TUNING,
  type DesktopDriveState,
} from '@smarteverything/domain';
import { BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncJobEnd, SyncJobProgress, SyncJobs, SyncJobsStatus } from '../src/kde-jobs.js';
import { createTray, type DesktopTray, type TrayOptions } from '../src/tray.js';
import { trayDriveOf } from '../src/tray-service.js';
import { traySyncOf } from '../src/tray-status.js';

interface FakeJob {
  readonly progress: SyncJobProgress[];
  end: SyncJobEnd | null;
}

const shared = vi.hoisted(() => ({
  menu: new Array<MenuItemConstructorOptions>(),
  menus: 0,
  tip: '',
  jobs: new Array<FakeJob>(),
  jobStatus: new Array<SyncJobsStatus>({ state: 'ready' }),
  jobListeners: new Array<(status: SyncJobsStatus) => void>(),
  progress: new Array<number>(),
  stop: vi.fn(),
  destroy: vi.fn(),
}));

interface TrayIconFixture {
  readonly tray: {
    readonly on: () => void;
    readonly setToolTip: (tip: string) => void;
    readonly setContextMenu: (menu: MenuItemConstructorOptions[]) => void;
    readonly destroy: () => void;
  };
  readonly show: () => void;
  readonly stop: () => void;
}

vi.mock('electron', () => ({
  BrowserWindow: class {
    readonly isVisible = (): boolean => false;
    readonly isFocused = (): boolean => false;
    readonly isDestroyed = (): boolean => false;
    readonly setProgressBar = (progress: number): void => {
      shared.progress.push(progress);
    };
    readonly hide = vi.fn();
  },
  Menu: {
    buildFromTemplate: (template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
      template,
  },
}));

vi.mock('../src/window.js', () => ({ revealWindow: vi.fn() }));
vi.mock('../src/failure.js', () => ({ reportFailure: vi.fn() }));

vi.mock('../src/tray-icon.js', () => ({
  themedTray: (): TrayIconFixture => ({
    tray: {
      on: vi.fn(),
      setToolTip: (tip: string): void => {
        shared.tip = tip;
      },
      setContextMenu: (menu: MenuItemConstructorOptions[]): void => {
        shared.menu = menu;
        shared.menus += 1;
      },
      destroy: shared.destroy,
    },
    show: vi.fn(),
    stop: shared.stop,
  }),
}));

const fakeJobs: SyncJobs = {
  status: () => {
    const status = shared.jobStatus.at(-1);
    if (status === undefined) throw new Error('Expected a job progress status');
    return status;
  },
  onStatus: (listener): void => {
    shared.jobListeners.push(listener);
  },
  open: (progress) => {
    const job: FakeJob = { progress: [progress], end: null };
    shared.jobs.push(job);
    return {
      update: (next): void => {
        job.progress.push(next);
      },
      finish: (end): void => {
        job.end = end;
      },
    };
  },
  stop: vi.fn(),
};

function driveCommands(): NonNullable<TrayOptions['drive']> {
  return { jobs: fakeJobs, sync: vi.fn(), mount: vi.fn() };
}

function options(drive?: TrayOptions['drive']): TrayOptions {
  return {
    iconDirectory: '/fake-tray-icons',
    window: new BrowserWindow(),
    service: { start: vi.fn(), stop: vi.fn(), restart: vi.fn() },
    managedBy: undefined,
    talk: vi.fn(),
    overlayItems: () => [{ label: 'Overlay controls' }],
    updateItems: () => [{ label: 'App updates' }],
    quit: vi.fn(),
    ...(drive === undefined ? {} : { drive }),
  };
}

function driveOf(tray: DesktopTray): NonNullable<DesktopTray['drive']> {
  if (tray.drive === undefined) throw new Error('Expected the registered Drive module');
  return tray.drive;
}

function labels(): (string | undefined)[] {
  return shared.menu.map((item) => item.label);
}

function click(label: string): void {
  const handler = shared.menu.find((item) => item.label === label)?.click;
  if (handler === undefined) throw new Error(`No tray action: ${label}`);
  Reflect.apply(handler, undefined, []);
}

beforeEach(() => {
  shared.menu = [];
  shared.menus = 0;
  shared.tip = '';
  shared.jobs = [];
  shared.jobStatus = [{ state: 'ready' }];
  shared.jobListeners = [];
  shared.progress = [];
  shared.stop.mockReset();
  shared.destroy.mockReset();
});

describe('optional Drive tray module', () => {
  it('keeps the existing shell menu without registering a Drive module', () => {
    const config = options();
    const tray = createTray(config);
    tray.show(null);
    expect(tray.drive).toBeUndefined();
    expect(labels()).toContain('Overlay controls');
    expect(labels()).toContain('App updates');
    expect(labels()).toContain('Start computer service');
    expect(labels()).toContain('Quit');
    expect(labels()).not.toContain('Pause sync');
    expect(labels()).not.toContain('Mount again');
    tray.talk({ status: 'Ready', activity: 'idle', channels: [], talkChannel: null });
    click('Open walkie-talkie');
    click('Start computer service');
    click('Quit');
    expect(config.service.start).toHaveBeenCalledOnce();
    expect(config.quit).toHaveBeenCalledOnce();
    expect(config.talk).toHaveBeenCalledWith({ kind: 'open' });
  });

  it('registers both state publishers and delegates sync and mount commands', () => {
    const commands = driveCommands();
    const tray = createTray(options(commands));
    const drive = driveOf(tray);
    tray.show(null);
    expect(labels()).not.toContain('Mount again');
    drive.sync({ status: 'Working', paused: false });
    drive.mount({ status: 'Stopped', mounted: false, syncing: null });
    click('Pause sync');
    click('Mount again');
    expect(commands.sync).toHaveBeenCalledWith({ kind: 'pause' });
    expect(commands.mount).toHaveBeenCalledWith({ kind: 'again' });
    drive.sync({ status: 'Paused', paused: true });
    click('Resume sync');
    expect(commands.sync).toHaveBeenLastCalledWith({ kind: 'resume' });
  });

  it('disables retry for mounted drives and clears each module state independently', () => {
    const tray = createTray(options(driveCommands()));
    const drive = driveOf(tray);
    tray.show(null);
    drive.sync({ status: 'Paused', paused: true });
    drive.mount({ status: 'Mounted', mounted: true, syncing: null });
    expect(shared.menu.find((item) => item.label === 'Mount again')?.enabled).toBe(false);
    drive.sync(null);
    expect(labels()).not.toContain('Resume sync');
    expect(labels()).toContain('Drive mount: Mounted');
    drive.mount(null);
    expect(labels()).not.toContain('Mount again');
    expect(labels()).toContain('Overlay controls');
    expect(labels()).toContain('App updates');
    expect(labels()).toContain('Start computer service');
    tray.destroy();
    expect(shared.stop).toHaveBeenCalledOnce();
    expect(shared.destroy).toHaveBeenCalledOnce();
  });
});

const SYNC = {
  placements: 2,
  paused: false,
  needBytes: 0,
  pendingOps: 0,
  failures: 0,
  folders: [],
} as const;

function controlState(change: Partial<DesktopDriveState> = {}): DesktopDriveState {
  return {
    mount: null,
    sync: SYNC,
    fuse: { available: true },
    cache: DEFAULT_DESKTOP_DRIVE_CACHE,
    tuning: { saved: DEFAULT_DESKTOP_DRIVE_TUNING, applied: [], limits: null },
    ...change,
  };
}

describe('drive mount syncing in the tray', () => {
  const SYNCING = {
    files: 3,
    bytes: 3000,
    sentFiles: 1,
    sentBytes: 1000,
    bytesPerSecond: 2000,
  } as const;

  it('shows the progress while files are on their way and tells when all are on the Hub', () => {
    const tray = createTray(options(driveCommands()));
    const drive = driveOf(tray);
    tray.show(null);
    drive.mount({ status: 'Mounted · Syncing', mounted: true, syncing: SYNCING });
    expect(labels()).toContain('25% sent');
    expect(shared.tip).toContain('Syncing 3 files');
    expect(shared.tip).toContain('25%');
    expect(shared.progress.at(-1)).toBe(0.25);
    expect(shared.jobs).toHaveLength(1);
    expect(shared.jobs[0]?.progress[0]).toEqual({
      title: 'Syncing My Drive',
      percent: 25,
      processedBytes: 1000,
      totalBytes: 4000,
      processedFiles: 1,
      totalFiles: 4,
      bytesPerSecond: 2000,
      current: null,
      info: '3 files left',
    });
    drive.mount({
      status: 'Mounted · Syncing',
      mounted: true,
      syncing: { ...SYNCING, sentBytes: 1500, bytes: 2500 },
    });
    expect(shared.jobs).toHaveLength(1);
    expect(shared.jobs[0]?.progress.at(-1)?.processedBytes).toBe(1500);
    drive.mount({ status: 'Mounted', mounted: true, syncing: null });
    expect(labels()).not.toContain('25% sent');
    expect(shared.tip).not.toContain('Syncing');
    expect(shared.progress.at(-1)).toBe(-1);
    expect(shared.jobs[0]?.end).toEqual({ kind: 'done' });
  });

  it('does not claim the changes reached the Hub when the mount went offline', () => {
    const tray = createTray(options(driveCommands()));
    const drive = driveOf(tray);
    drive.mount({ status: 'Mounted · Syncing', mounted: true, syncing: SYNCING });
    drive.mount({ status: 'Mount offline', mounted: false, syncing: null });
    drive.mount(null);
    expect(shared.jobs).toHaveLength(1);
    expect(shared.jobs[0]?.end).toEqual({ kind: 'failed', message: 'My Drive went offline' });
  });

  it('shows a synced folder with its current file and tells when it is up to date', () => {
    const tray = createTray(options(driveCommands()));
    const drive = driveOf(tray);
    const folder = {
      placementId: 'p1',
      name: 'Projects',
      files: 2,
      bytes: 500,
      sentFiles: 2,
      sentBytes: 500,
      bytesPerSecond: 100,
      current: 'src/main.ts',
    } as const;
    drive.folders({ ...SYNC, pendingOps: 2, folders: [folder] });
    expect(labels()).toContain('Projects: 50% · 2 files left');
    expect(shared.progress.at(-1)).toBe(0.5);
    expect(shared.jobs[0]?.progress[0]).toMatchObject({
      title: 'Syncing Projects',
      current: 'src/main.ts',
      bytesPerSecond: 100,
    });
    drive.folders(SYNC);
    expect(shared.progress.at(-1)).toBe(-1);
    expect(shared.jobs[0]?.end).toEqual({ kind: 'done' });
  });

  it('ends folder jobs as paused or failed with the reason', () => {
    const tray = createTray(options(driveCommands()));
    const drive = driveOf(tray);
    const folder = {
      placementId: 'p1',
      name: 'Projects',
      files: 1,
      bytes: 10,
      sentFiles: 0,
      sentBytes: 0,
      bytesPerSecond: null,
      current: null,
    } as const;
    drive.folders({ ...SYNC, pendingOps: 1, folders: [folder] });
    drive.folders({ ...SYNC, paused: true, pendingOps: 1, folders: [folder] });
    expect(shared.jobs[0]?.end).toEqual({ kind: 'paused' });
    drive.folders({ ...SYNC, pendingOps: 1, folders: [folder] });
    drive.folders({ ...SYNC, failures: 1 });
    expect(shared.jobs[1]?.end).toEqual({ kind: 'failed', message: '1 file needs attention' });
  });

  it('says in the tray when job progress is unavailable on this desktop', () => {
    const tray = createTray(options(driveCommands()));
    tray.show(null);
    expect(labels().some((label) => label?.startsWith('Sync progress') === true)).toBe(false);
    const unavailable: SyncJobsStatus = {
      state: 'unavailable',
      reason: 'this desktop has no org.kde.JobViewServer service',
    };
    shared.jobStatus.push(unavailable);
    for (const listener of shared.jobListeners) listener(unavailable);
    expect(labels()).toContain(
      'Sync progress in notifications is unavailable: this desktop has no org.kde.JobViewServer service',
    );
  });
});

describe('drive tray status', () => {
  it('words the sync summary for the tray', () => {
    expect(traySyncOf(null)).toBeNull();
    expect(traySyncOf(SYNC)).toEqual({ status: 'Up to date', paused: false });
    expect(traySyncOf({ ...SYNC, pendingOps: 3 })).toEqual({ status: 'Syncing', paused: false });
    expect(traySyncOf({ ...SYNC, needBytes: 2048 })?.status).toMatch(/^Syncing, .* left$/);
    expect(traySyncOf({ ...SYNC, failures: 2 })).toEqual({
      status: '2 need attention',
      paused: false,
    });
    expect(traySyncOf({ ...SYNC, paused: true, failures: 2 })).toEqual({
      status: 'Paused',
      paused: true,
    });
  });
});

describe('drive tray link to the Computer service', () => {
  function client(current: DesktopDriveState | null): {
    readonly link: ReturnType<typeof trayDriveOf>;
    readonly run: ReturnType<typeof vi.fn>;
    readonly emit: (state: DesktopDriveState | null) => void;
  } {
    const run = vi.fn((): Promise<DesktopDriveState> => Promise.resolve(controlState()));
    let listener: (state: DesktopDriveState | null) => void = (): void => undefined;
    const link = trayDriveOf(
      {
        run,
        current,
        onState: (next): (() => void) => {
          listener = next;
          return (): void => {
            listener = (): void => undefined;
          };
        },
      },
      fakeJobs,
    );
    return {
      link,
      run,
      emit: (state): void => {
        listener(state);
      },
    };
  }

  it('turns tray commands into control commands', () => {
    const { link, run } = client(null);
    link.commands.sync({ kind: 'pause' });
    link.commands.sync({ kind: 'resume' });
    link.commands.mount({ kind: 'again' });
    expect(run.mock.calls).toEqual([
      [{ kind: 'sync-pause' }],
      [{ kind: 'sync-resume' }],
      [{ kind: 'again' }],
    ]);
  });

  it('rebuilds the tray menu only when what the tray shows changes', () => {
    const { link, emit } = client(controlState());
    const tray = createTray(options(driveCommands()));
    link.follow(driveOf(tray));
    const built = shared.menus;
    emit(controlState({ cache: { ...DEFAULT_DESKTOP_DRIVE_CACHE } }));
    emit(controlState({ fuse: { available: true } }));
    expect(shared.menus).toBe(built);
    emit(controlState({ sync: { ...SYNC, pendingOps: 1 } }));
    expect(shared.menus).toBe(built + 1);
    expect(labels()).toContain('Drive sync: Syncing');
  });

  it('publishes the service state and clears it when the service goes away', () => {
    const { link, emit } = client(controlState());
    const sync = vi.fn();
    const mount = vi.fn();
    const folders = vi.fn();
    const stop = link.follow({ sync, mount, folders });
    expect(sync).toHaveBeenLastCalledWith({ status: 'Up to date', paused: false });
    expect(mount).toHaveBeenLastCalledWith(null);
    const mounted = { status: 'Mounted', mounted: true, points: [], syncing: null } as const;
    emit(controlState({ mount: mounted, sync: null }));
    expect(sync).toHaveBeenLastCalledWith(null);
    expect(mount).toHaveBeenLastCalledWith(mounted);
    emit(null);
    expect(sync).toHaveBeenLastCalledWith(null);
    expect(mount).toHaveBeenLastCalledWith(null);
    stop();
  });
});
