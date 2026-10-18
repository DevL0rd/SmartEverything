import type {
  DesktopServiceStatus,
  DesktopTalkCommand,
  DesktopTalkTray,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  Menu,
  nativeImage,
  Tray,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';
import { talkMenuItems, talkTrayImages } from './talk/talk-tray.js';
import { trayHealthLabel } from './tray-status.js';
import { revealWindow } from './window.js';

const TRAY_ICON_SIZE = 24;

const log = new Logger('desktop.tray');

interface TrayServiceControls {
  readonly start: () => void;
  readonly stop: () => void;
  readonly restart: () => void;
}

export interface TrayOptions {
  readonly icon: string;
  readonly window: BrowserWindow;
  readonly service: TrayServiceControls;
  readonly managedBy: 'stable-app' | undefined;
  readonly talk: (command: DesktopTalkCommand) => void;
  readonly overlayItems: () => MenuItemConstructorOptions[];
  readonly updateItems: () => MenuItemConstructorOptions[];
  readonly quit: () => void;
}

export interface DesktopTray {
  readonly show: (status: DesktopServiceStatus | null) => void;
  readonly talk: (state: DesktopTalkTray) => void;
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

function serviceItems(
  status: DesktopServiceStatus | null,
  controls: TrayServiceControls,
): MenuItemConstructorOptions[] {
  const active = status?.active ?? false;
  const installed = status?.installed ?? false;
  return [
    { label: trayHealthLabel(status), enabled: false },
    { label: 'Start server', enabled: !active, click: controls.start },
    { label: 'Restart server', enabled: installed && active, click: controls.restart },
    { label: 'Stop server', enabled: installed && active, click: controls.stop },
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

function menuOf(
  options: TrayOptions,
  service: readonly MenuItemConstructorOptions[],
  talk: DesktopTalkTray | null,
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
    ...talkMenuItems(talk, options.talk),
    ...service,
    ...options.updateItems(),
    { type: 'separator' },
    { label: 'Quit', click: options.quit },
  ]);
}

export function createTray(options: TrayOptions): DesktopTray {
  const images = talkTrayImages(
    nativeImage
      .createFromPath(options.icon)
      .resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE }),
  );
  const tray = new Tray(images.idle);
  log.info('tray.created', { managedBy: options.managedBy ?? 'self', iconSize: TRAY_ICON_SIZE });
  let service: MenuItemConstructorOptions[] = [];
  let talk: DesktopTalkTray | null = null;
  let health = trayHealthLabel(null);
  const render = (): void => {
    log.trace('tray.rendered', { health, talking: talk !== null });
    tray.setToolTip(
      talk === null ? `SmartEverything: ${health}` : `SmartEverything: ${health} · ${talk.status}`,
    );
    tray.setContextMenu(menuOf(options, service, talk));
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
      talk = state;
      log.debug('tray.talk_changed', {
        activity: state.activity,
        channels: state.channels.length,
        statusLength: state.status.length,
      });
      tray.setImage(images[state.activity]);
      render();
    },
    refresh: render,
    destroy: (): void => {
      log.info('tray.destroyed');
      tray.destroy();
    },
  };
}
