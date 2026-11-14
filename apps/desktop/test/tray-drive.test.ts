import { DEFAULT_DESKTOP_DRIVE_CACHE, type DesktopDriveState } from '@smarteverything/domain';
import { BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTray, type DesktopTray, type TrayOptions } from '../src/tray.js';
import { trayDriveOf } from '../src/tray-service.js';
import { traySyncOf } from '../src/tray-status.js';

const shared = vi.hoisted(() => ({
  menu: new Array<MenuItemConstructorOptions>(),
  stop: vi.fn(),
  destroy: vi.fn(),
}));

interface TrayIconFixture {
  readonly tray: {
    readonly on: () => void;
    readonly setToolTip: () => void;
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
      setToolTip: vi.fn(),
      setContextMenu: (menu: MenuItemConstructorOptions[]): void => {
        shared.menu = menu;
      },
      destroy: shared.destroy,
    },
    show: vi.fn(),
    stop: shared.stop,
  }),
}));

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
    const commands = { sync: vi.fn(), mount: vi.fn() };
    const tray = createTray(options(commands));
    const drive = driveOf(tray);
    tray.show(null);
    expect(labels()).not.toContain('Mount again');
    drive.sync({ status: 'Working', paused: false });
    drive.mount({ status: 'Stopped', mounted: false });
    click('Pause sync');
    click('Mount again');
    expect(commands.sync).toHaveBeenCalledWith({ kind: 'pause' });
    expect(commands.mount).toHaveBeenCalledWith({ kind: 'again' });
    drive.sync({ status: 'Paused', paused: true });
    click('Resume sync');
    expect(commands.sync).toHaveBeenLastCalledWith({ kind: 'resume' });
  });

  it('disables retry for mounted drives and clears each module state independently', () => {
    const tray = createTray(options({ sync: vi.fn(), mount: vi.fn() }));
    const drive = driveOf(tray);
    tray.show(null);
    drive.sync({ status: 'Paused', paused: true });
    drive.mount({ status: 'Mounted', mounted: true });
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

const SYNC = { placements: 2, paused: false, needBytes: 0, pendingOps: 0, failures: 0 } as const;

function controlState(change: Partial<DesktopDriveState> = {}): DesktopDriveState {
  return {
    mount: null,
    sync: SYNC,
    fuse: { available: true },
    firstRun: { pending: false, defaultParent: '/home/u/SmartEverything' },
    cache: DEFAULT_DESKTOP_DRIVE_CACHE,
    ...change,
  };
}

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
    const link = trayDriveOf({
      run,
      current,
      onState: (next): (() => void) => {
        listener = next;
        return (): void => {
          listener = (): void => undefined;
        };
      },
    });
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

  it('publishes the service state and clears it when the service goes away', () => {
    const { link, emit } = client(controlState());
    const sync = vi.fn();
    const mount = vi.fn();
    const stop = link.follow({ sync, mount });
    expect(sync).toHaveBeenLastCalledWith({ status: 'Up to date', paused: false });
    expect(mount).toHaveBeenLastCalledWith(null);
    emit(controlState({ mount: { status: 'Mounted', mounted: true }, sync: null }));
    expect(sync).toHaveBeenLastCalledWith(null);
    expect(mount).toHaveBeenLastCalledWith({ status: 'Mounted', mounted: true });
    emit(null);
    expect(sync).toHaveBeenLastCalledWith(null);
    expect(mount).toHaveBeenLastCalledWith(null);
    stop();
  });
});
