import type {
  DesktopFfmpeg,
  DesktopServiceStatus,
  DesktopTalkCommand,
  DesktopTalkTray,
} from '@smarteverything/domain';
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

interface TrayServiceControls {
  readonly start: () => void;
  readonly stop: () => void;
  readonly restart: () => void;
  readonly showFfmpeg: () => void;
}

export interface TrayOptions {
  readonly icon: string;
  readonly window: BrowserWindow;
  readonly service: TrayServiceControls;
  readonly managedBy: 'stable-app' | undefined;
  readonly talk: (command: DesktopTalkCommand) => void;
  readonly quit: () => void;
}

export interface DesktopTray {
  readonly show: (status: DesktopServiceStatus | null, ffmpeg: DesktopFfmpeg) => void;
  readonly talk: (state: DesktopTalkTray) => void;
  readonly destroy: () => void;
}

function toggle(window: BrowserWindow): void {
  if (window.isVisible() && window.isFocused()) {
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

function ffmpegItems(
  ffmpeg: DesktopFfmpeg,
  controls: TrayServiceControls,
): MenuItemConstructorOptions[] {
  return ffmpeg.found
    ? []
    : [{ label: 'ffmpeg is missing: how to install it', click: controls.showFfmpeg }];
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
    ...talkMenuItems(talk, options.talk),
    ...service,
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
  let service: MenuItemConstructorOptions[] = [];
  let talk: DesktopTalkTray | null = null;
  let health = trayHealthLabel(null);
  const render = (): void => {
    tray.setToolTip(
      talk === null ? `SmartEverything: ${health}` : `SmartEverything: ${health} · ${talk.status}`,
    );
    tray.setContextMenu(menuOf(options, service, talk));
  };
  tray.on('click', () => {
    toggle(options.window);
  });
  return {
    show: (status, ffmpeg): void => {
      health = trayHealthLabel(status);
      service =
        options.managedBy === 'stable-app'
          ? stableAppItems(status)
          : [...serviceItems(status, options.service), ...ffmpegItems(ffmpeg, options.service)];
      render();
    },
    talk: (state): void => {
      talk = state;
      tray.setImage(images[state.activity]);
      render();
    },
    destroy: (): void => {
      tray.destroy();
    },
  };
}
