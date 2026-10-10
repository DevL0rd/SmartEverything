import path from 'node:path';
import { app } from 'electron';
import {
  GO2RTC_RESOURCE_DIRECTORY,
  go2rtcBuildName,
  go2rtcShippedName,
} from './service/go2rtc-binary.js';
import { DESKTOP_VARIANTS, type DesktopVariant } from './variant.js';
import { WINDOW_STATE_FILE } from './window-state.js';

const WEB_EXPORT_DIRECTORY = 'dist';
const ICON_FILE = 'icon.png';
const SERVICE_RESOURCE_DIRECTORY = 'service';
const SERVICE_ENTRY_FILE = 'service.mjs';

export interface DesktopPaths {
  readonly webRoot: string;
  readonly icon: string;
  readonly preload: string;
  readonly windowState: string;
  readonly dataDirectory: string;
  readonly serviceEntry: string;
  readonly go2rtcBinary: string;
}

type Resources = Pick<DesktopPaths, 'webRoot' | 'icon' | 'serviceEntry' | 'go2rtcBinary'>;

function packagedResources(): Resources {
  return {
    webRoot: path.join(process.resourcesPath, WEB_EXPORT_DIRECTORY),
    icon: path.join(process.resourcesPath, ICON_FILE),
    serviceEntry: path.join(process.resourcesPath, SERVICE_RESOURCE_DIRECTORY, SERVICE_ENTRY_FILE),
    go2rtcBinary: path.join(
      process.resourcesPath,
      GO2RTC_RESOURCE_DIRECTORY,
      go2rtcShippedName(process.platform),
    ),
  };
}

function workspaceResources(): Resources {
  const desktopWorkspace = app.getAppPath();
  const appWorkspace = path.resolve(desktopWorkspace, '..', 'app');
  return {
    webRoot: path.join(appWorkspace, WEB_EXPORT_DIRECTORY),
    icon: path.join(appWorkspace, 'assets', ICON_FILE),
    serviceEntry: path.join(
      desktopWorkspace,
      'dist',
      SERVICE_RESOURCE_DIRECTORY,
      SERVICE_ENTRY_FILE,
    ),
    go2rtcBinary: path.resolve(
      desktopWorkspace,
      '..',
      '..',
      'tooling',
      'go2rtc',
      'out',
      go2rtcBuildName(process.platform, process.arch),
    ),
  };
}

function serviceDataDirectory(variant: DesktopVariant): string {
  return variant.managedBy === 'stable-app'
    ? path.join(app.getPath('appData'), DESKTOP_VARIANTS.release.productName)
    : app.getPath('userData');
}

export function desktopPaths(variant: DesktopVariant): DesktopPaths {
  return {
    ...(app.isPackaged ? packagedResources() : workspaceResources()),
    preload: path.join(import.meta.dirname, 'preload.cjs'),
    windowState: path.join(app.getPath('userData'), WINDOW_STATE_FILE),
    dataDirectory: serviceDataDirectory(variant),
  };
}
