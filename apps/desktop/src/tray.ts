import type {
  DesktopServiceStatus,
  DesktopTalkCommand,
  DesktopTalkTray,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { talkMenuItems } from './talk/talk-tray.js';
import { themedTray } from './tray-icon.js';
import { trayHealthLabel } from './tray-status.js';
import { revealWindow } from './window.js';

const log = new Logger('desktop.tray');

export interface DriveSyncTray {
  readonly status: string;
  readonly paused: boolean;
}

export type DriveSyncCommand = { readonly kind: 'pause' } | { readonly kind: 'resume' };

export interface DriveMountTray {
  readonly status: string;
  readonly mounted: boolean;
}

export interface DriveMountCommand {
  readonly kind: 'again';
}

interface TrayServiceControls {
  readonly start: () => void;
  readonly stop: () => void;
  readonly restart: () => void;
}

export interface DriveTrayCommands {
  readonly sync: (command: DriveSyncCommand) => void;
  readonly mount: (command: DriveMountCommand) => void;
}

export interface DriveTrayState {
  readonly sync: (state: DriveSyncTray | null) => void;
  readonly mount: (state: DriveMountTray | null) => void;
}

export interface TrayOptions {
  readonly iconDirectory: string;
  readonly window: BrowserWindow;
  readonly service: TrayServiceControls;
  readonly managedBy: 'stable-app' | undefined;
  readonly talk: (command: DesktopTalkCommand) => void;
  readonly drive?: DriveTrayCommands;
  readonly overlayItems: () => MenuItemConstructorOptions[];
  readonly updateItems: () => MenuItemConstructorOptions[];
  readonly quit: () => void;
}

export interface DesktopTray {
  readonly show: (status: DesktopServiceStatus | null) => void;
  readonly talk: (state: DesktopTalkTray) => void;
  readonly drive?: DriveTrayState;
  readonly refresh: () => void;
  readonly destroy: () => void;
}

function toggle(window: BrowserWindow): void {
  const hiding = window.isVisible() && window.isFocused();
  log.debug('tray.toggled', () => ({
    hiding,
    visible: window.isVisible(),
    focused: window.isFocused(),
  }));
  if (hiding) {
    window.hide();
    return;
  }
  revealWindow(window);
}

export function driveSyncToggle(state: DriveSyncTray): DriveSyncCommand {
  return { kind: state.paused ? 'resume' : 'pause' };
}

export function driveSyncMenuItems(
  state: DriveSyncTray | null,
  send: (command: DriveSyncCommand) => void,
): MenuItemConstructorOptions[] {
  if (state === null) {
    return [];
  }
  return [
    { label: `Drive sync: ${state.status}`, enabled: false },
    {
      label: state.paused ? 'Resume sync' : 'Pause sync',
      click: (): void => {
        send(driveSyncToggle(state));
      },
    },
    { type: 'separator' },
  ];
}

export function driveMountMenuItems(
  state: DriveMountTray | null,
  send: (command: DriveMountCommand) => void,
): MenuItemConstructorOptions[] {
  if (state === null) {
    return [];
  }
  return [
    { label: `Drive mount: ${state.status}`, enabled: false },
    {
      label: 'Mount again',
      enabled: !state.mounted,
      click: (): void => {
        send({ kind: 'again' });
      },
    },
    { type: 'separator' },
  ];
}

function serviceItems(
  status: DesktopServiceStatus | null,
  controls: TrayServiceControls,
): MenuItemConstructorOptions[] {
  const active = status?.active ?? false;
  const installed = status?.installed ?? false;
  return [
    { label: trayHealthLabel(status), enabled: false },
    { label: 'Start computer service', enabled: !active, click: controls.start },
    { label: 'Restart computer service', enabled: installed && active, click: controls.restart },
    { label: 'Stop computer service', enabled: installed && active, click: controls.stop },
  ];
}

function stableAppItems(status: DesktopServiceStatus | null): MenuItemConstructorOptions[] {
  return [
    { label: trayHealthLabel(status), enabled: false },
    { label: 'Managed by the stable app', enabled: false },
  ];
}

function statusItems(
  options: TrayOptions,
  status: DesktopServiceStatus | null,
): MenuItemConstructorOptions[] {
  return options.managedBy === 'stable-app'
    ? stableAppItems(status)
    : serviceItems(status, options.service);
}

interface ShownState {
  talk: DesktopTalkTray | null;
  driveSync: DriveSyncTray | null;
  driveMount: DriveMountTray | null;
}

function driveMenuItems(
  commands: DriveTrayCommands | undefined,
  shown: ShownState,
): MenuItemConstructorOptions[] {
  if (commands === undefined) return [];
  return [
    ...driveSyncMenuItems(shown.driveSync, commands.sync),
    ...driveMountMenuItems(shown.driveMount, commands.mount),
  ];
}

function menuOf(
  options: TrayOptions,
  service: readonly MenuItemConstructorOptions[],
  shown: ShownState,
): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Show or hide',
      click: (): void => {
        toggle(options.window);
      },
    },
    { type: 'separator' },
    ...options.overlayItems(),
    ...talkMenuItems(shown.talk, options.talk),
    ...driveMenuItems(options.drive, shown),
    ...service,
    ...options.updateItems(),
    { type: 'separator' },
    { label: 'Quit', click: options.quit },
  ]);
}

function driveTrayHandlers(
  show: (change: Partial<ShownState>) => void,
  render: () => void,
): DriveTrayState {
  return {
    sync: (state): void => {
      show({ driveSync: state });
      log.debug('tray.drive_sync_changed', { paused: state?.paused ?? null });
      render();
    },
    mount: (state): void => {
      show({ driveMount: state });
      log.debug('tray.drive_mount_changed', { mounted: state?.mounted ?? null });
      render();
    },
  };
}

function registerDriveTray(
  commands: DriveTrayCommands | undefined,
  shown: ShownState,
  render: () => void,
): Pick<DesktopTray, 'drive'> {
  if (commands === undefined) return {};
  return {
    drive: driveTrayHandlers((change) => {
      Object.assign(shown, change);
    }, render),
  };
}

export function createTray(options: TrayOptions): DesktopTray {
  const icon = themedTray(options.iconDirectory, process.platform);
  const { tray } = icon;
  log.info('tray.created', { managedBy: options.managedBy ?? 'self' });
  let service: MenuItemConstructorOptions[] = [];
  const shown: ShownState = { talk: null, driveSync: null, driveMount: null };
  let health = trayHealthLabel(null);
  const render = (): void => {
    const { talk } = shown;
    log.trace('tray.rendered', { health, talking: talk !== null });
    tray.setToolTip(`SmartEverything: ${talk === null ? health : `${health} · ${talk.status}`}`);
    tray.setContextMenu(menuOf(options, service, shown));
  };
  tray.on('click', () => {
    toggle(options.window);
  });
  return {
    show: (status): void => {
      log.debug('tray.status_shown', {
        health: status?.health ?? null,
        active: status?.active ?? null,
      });
      health = trayHealthLabel(status);
      service = statusItems(options, status);
      render();
    },
    talk: (state): void => {
      shown.talk = state;
      log.debug('tray.talk_changed', {
        activity: state.activity,
        channels: state.channels.length,
        statusLength: state.status.length,
      });
      icon.show(state.activity);
      render();
    },
    ...registerDriveTray(options.drive, shown, render),
    refresh: render,
    destroy: (): void => {
      log.info('tray.destroyed');
      icon.stop();
      tray.destroy();
    },
  };
}
