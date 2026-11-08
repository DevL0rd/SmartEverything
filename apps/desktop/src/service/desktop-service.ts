import { userInfo } from 'node:os';
import type { DesktopPlatform } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { app } from 'electron';
import { readSearchPath, readXdgEnvironment } from '../environment.js';
import type { DesktopPaths } from '../paths.js';
import type { DesktopVariant } from '../variant.js';
import { ServiceController } from './controller.js';
import type { ServiceLaunch } from './definitions.js';
import { linuxManager } from './linux-manager.js';
import { serviceLocations } from './locations.js';
import { macManager } from './mac-manager.js';
import type { ManagerContext, ServiceManager } from './manager.js';
import { efficiencyCores } from './efficiency-cores.js';
import { servicePath } from './search-path.js';
import { nodeSystem } from './system.js';
import { windowsManager } from './windows-manager.js';

const READY_TIMEOUT_MS = 60_000;

const log = new Logger('desktop.service');

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

function managerFor(platform: DesktopPlatform, context: ManagerContext): ServiceManager {
  switch (platform) {
    case 'linux':
      return linuxManager(context);
    case 'darwin':
      return macManager(context);
    case 'win32':
      return windowsManager(context);
  }
}

export interface DesktopService {
  readonly controller: ServiceController;
}

export function createDesktopService(
  platform: DesktopPlatform,
  paths: DesktopPaths,
  variant: DesktopVariant,
  failed: (cause: unknown) => void,
): DesktopService {
  const dataDirectory = paths.dataDirectory;
  const launch: ServiceLaunch = {
    executable: paths.serviceExecutable,
    entry: paths.serviceEntry,
    dataDirectory,
    path: servicePath(platform, readSearchPath()),
    efficiencyCores: efficiencyCores(platform),
  };
  const locations = serviceLocations({
    home: app.getPath('home'),
    dataDirectory,
    xdgConfigHome: readXdgEnvironment().XDG_CONFIG_HOME,
  });
  const account = userInfo();
  const user = { name: account.username, uid: account.uid };
  const manager = managerFor(platform, { launch, locations, system: nodeSystem, user });
  log.info('service.created', { platform, manager: manager.kind });
  return {
    controller: new ServiceController({
      manager,
      locations,
      system: nodeSystem,
      timeoutMs: READY_TIMEOUT_MS,
      failed,
      managedBy: variant.managedBy,
    }),
  };
}
