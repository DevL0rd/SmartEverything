import { BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTray, type DesktopTray, type TrayOptions } from '../src/tray.js';

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
