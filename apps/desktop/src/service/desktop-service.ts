import { statSync } from 'node:fs';
import { userInfo } from 'node:os';
import type { DesktopFfmpeg, DesktopPlatform } from '@smarteverything/domain';
import { app } from 'electron';
import { readSearchPath, readXdgEnvironment } from '../environment.js';
import type { DesktopPaths } from '../paths.js';
import type { DesktopVariant } from '../variant.js';
import { ServiceController } from './controller.js';
import type { ServiceLaunch } from './definitions.js';
import { linuxManager } from './linux-manager.js';
import { linuxSystemManager } from './linux-system-manager.js';
import { openWebSocket } from './live-link.js';
import { serviceLocations } from './locations.js';
import { macManager } from './mac-manager.js';
import type { ManagerContext, ServiceManager } from './manager.js';
import { ffmpegCheck, servicePath } from './search-path.js';
import { nodeSystem, runAwaitingApproval } from './system.js';
import { windowsManager } from './windows-manager.js';

const READY_TIMEOUT_MS = 60_000;

class ServiceResourceMissingError extends Error {
  readonly file: string;

  constructor(subject: string, file: string, remedy: string) {
    super(`${subject} must exist at ${file}; it does not. ${remedy}`);
    this.name = 'ServiceResourceMissingError';
    this.file = file;
  }
}

class UnsupportedPlatformError extends Error {
  constructor(received: string) {
    super(`SmartEverything runs on Linux, macOS or Windows; received ${received}`);
    this.name = 'UnsupportedPlatformError';
  }
}

export function currentPlatform(): DesktopPlatform {
  const platform = process.platform;
  if (platform === 'linux' || platform === 'darwin' || platform === 'win32') {
    return platform;
  }
  throw new UnsupportedPlatformError(platform);
}

function isFile(candidate: string): boolean {
  return statSync(candidate, { throwIfNoEntry: false })?.isFile() ?? false;
}

function managerFor(platform: DesktopPlatform, context: ManagerContext): ServiceManager {
  switch (platform) {
    case 'linux':
      return isFile(context.locations.systemUnitFile)
        ? linuxSystemManager(context, runAwaitingApproval)
        : linuxManager(context);
    case 'darwin':
      return macManager(context);
    case 'win32':
      return windowsManager(context);
  }
}

export interface DesktopService {
  readonly controller: ServiceController;
  readonly launch: ServiceLaunch;
  readonly user: string;
  readonly ffmpeg: () => DesktopFfmpeg;
  readonly checkResources: () => void;
}

export function createDesktopService(
  platform: DesktopPlatform,
  paths: DesktopPaths,
  variant: DesktopVariant,
  failed: (cause: unknown) => void,
): DesktopService {
  const launch: ServiceLaunch = {
    executable: process.execPath,
    entry: paths.serviceEntry,
    dataDirectory: paths.dataDirectory,
    path: servicePath(platform, readSearchPath()),
  };
  const locations = serviceLocations({
    home: app.getPath('home'),
    dataDirectory: paths.dataDirectory,
    xdgConfigHome: readXdgEnvironment().XDG_CONFIG_HOME,
  });
  const account = userInfo();
  const user = { name: account.username, uid: account.uid };
  const manager = managerFor(platform, { launch, locations, system: nodeSystem, user });
  const remedy = app.isPackaged
    ? 'Reinstall SmartEverything.'
    : 'Run "pnpm run build:go2rtc" and "pnpm --filter @smarteverything/desktop run build".';
  return {
    controller: new ServiceController({
      manager,
      locations,
      system: nodeSystem,
      go2rtcBinary: paths.go2rtcBinary,
      openSocket: openWebSocket,
      timeoutMs: READY_TIMEOUT_MS,
      failed,
      managedBy: variant.managedBy,
    }),
    launch,
    user: user.name,
    ffmpeg: () => ffmpegCheck(platform, launch.path, isFile),
    checkResources: (): void => {
      if (!isFile(paths.serviceEntry)) {
        throw new ServiceResourceMissingError('The server program', paths.serviceEntry, remedy);
      }
      if (!isFile(paths.go2rtcBinary)) {
        throw new ServiceResourceMissingError('go2rtc', paths.go2rtcBinary, remedy);
      }
    },
  };
}
