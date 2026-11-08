import path from 'node:path';
import { app } from 'electron';
import { DESKTOP_VARIANTS, type DesktopVariant } from './variant.js';
import { COMPUTER_DIRECTORY, COMPUTER_ENTRY } from './package-layout.js';
import { WINDOW_STATE_FILE } from './window-state.js';

const WEB_EXPORT_DIRECTORY = 'dist';
const ICON_FILE = 'icon.png';
const TRAY_DIRECTORY = 'tray';

export interface DesktopPaths {
  readonly webRoot: string;
  readonly icon: string;
  readonly trayIcons: string;
  readonly preload: string;
  readonly windowState: string;
  readonly dataDirectory: string;
  readonly serviceEntry: string;
}

type Resources = Pick<DesktopPaths, 'webRoot' | 'icon' | 'trayIcons' | 'serviceEntry'>;

function packagedResources(): Resources {
  return {
    webRoot: path.join(process.resourcesPath, WEB_EXPORT_DIRECTORY),
    icon: path.join(process.resourcesPath, ICON_FILE),
    trayIcons: path.join(process.resourcesPath, TRAY_DIRECTORY),
    serviceEntry: path.join(process.resourcesPath, COMPUTER_DIRECTORY, COMPUTER_ENTRY),
  };
}

function workspaceResources(): Resources {
  const desktopWorkspace = app.getAppPath();
  const appWorkspace = path.resolve(desktopWorkspace, '..', 'app');
  return {
    webRoot: path.join(appWorkspace, WEB_EXPORT_DIRECTORY),
    icon: path.join(appWorkspace, 'assets', ICON_FILE),
    trayIcons: path.join(desktopWorkspace, 'assets', TRAY_DIRECTORY),
    serviceEntry: path.join(desktopWorkspace, 'dist', COMPUTER_DIRECTORY, COMPUTER_ENTRY),
  };
}

function serviceDataDirectory(): string {
  const appData = app.getPath('appData');
  return path.join(appData, `${DESKTOP_VARIANTS.release.productName}-node`);
}

export function desktopUserDataPath(variant: DesktopVariant): string {
  return path.join(app.getPath('appData'), variant.userDataName);
}

export function prepareUserData(variant: DesktopVariant): void {
  app.setPath('userData', desktopUserDataPath(variant));
}

export function desktopPaths(): DesktopPaths {
  return {
    ...(app.isPackaged ? packagedResources() : workspaceResources()),
    preload: path.join(import.meta.dirname, 'preload.cjs'),
    windowState: path.join(app.getPath('userData'), WINDOW_STATE_FILE),
    dataDirectory: serviceDataDirectory(),
  };
}
