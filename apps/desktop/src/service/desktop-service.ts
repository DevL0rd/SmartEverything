import { statSync } from 'node:fs';
import { userInfo } from 'node:os';
import type { DesktopPlatform } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { app } from 'electron';
import { readSearchPath, readXdgEnvironment } from '../environment.js';
import type { DesktopPaths } from '../paths.js';
import type { DesktopVariant } from '../variant.js';
import { ServiceController } from './controller.js';
import {
  HUB_SERVICE_NAMES,
  NODE_SERVICE_NAMES,
  type ServiceLaunch,
  type ServiceNames,
} from './definitions.js';
import { linuxManager } from './linux-manager.js';
import { openWebSocket } from './live-link.js';
import { companionDirectory, serviceLocations } from './locations.js';
import { macManager } from './mac-manager.js';
import type { ManagerContext, ServiceManager } from './manager.js';
import type { Companion } from './companion.js';
import { efficiencyCores } from './efficiency-cores.js';
import { servicePath } from './search-path.js';
import { nodeSystem } from './system.js';
import { windowsManager } from './windows-manager.js';

const READY_TIMEOUT_MS = 60_000;

const log = new Logger('desktop.service');

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
      return linuxManager(context);
    case 'darwin':
      return macManager(context);
    case 'win32':
      return windowsManager(context);
  }
}

export interface DesktopService {
  readonly controller: ServiceController;
  readonly companion: Companion;
  readonly launch: ServiceLaunch;
  readonly checkResources: () => void;
}

interface RoleInput {
  readonly names: ServiceNames;
  readonly platform: DesktopPlatform;
  readonly dataDirectory: string;
  readonly paths: DesktopPaths;
  readonly failed: (cause: unknown) => void;
  readonly managedBy: DesktopVariant['managedBy'];
}

function createRole(input: RoleInput): Companion {
  const { names, platform, dataDirectory, paths } = input;
  const launch: ServiceLaunch = {
    executable: process.execPath,
    entry: paths.serviceEntry,
    dataDirectory,
    path: servicePath(platform, readSearchPath()),
    efficiencyCores: efficiencyCores(platform),
  };
  const locations = serviceLocations(
    {
      home: app.getPath('home'),
      dataDirectory,
      xdgConfigHome: readXdgEnvironment().XDG_CONFIG_HOME,
    },
    names,
  );
  const account = userInfo();
  const user = { name: account.username, uid: account.uid };
  const manager = managerFor(platform, { names, launch, locations, system: nodeSystem, user });
  log.info('service.created', { platform, manager: manager.kind, role: names.role });
  return {
    manager,
    locations,
    system: nodeSystem,
    launch,
    controller: new ServiceController({
      manager,
      locations,
      system: nodeSystem,
      go2rtcBinary: paths.go2rtcBinary,
      openSocket: openWebSocket,
      timeoutMs: READY_TIMEOUT_MS,
      failed: input.failed,
      managedBy: input.managedBy,
    }),
  };
}

export function createDesktopService(
  platform: DesktopPlatform,
  paths: DesktopPaths,
  variant: DesktopVariant,
  failed: (cause: unknown) => void,
): DesktopService {
  const shared = { platform, paths, failed, managedBy: variant.managedBy };
  const primary = createRole({
    ...shared,
    names: HUB_SERVICE_NAMES,
    dataDirectory: paths.dataDirectory,
  });
  const companion = createRole({
    ...shared,
    names: NODE_SERVICE_NAMES,
    dataDirectory: companionDirectory(paths.dataDirectory),
  });
  const remedy = app.isPackaged
    ? 'Reinstall SmartEverything.'
    : 'Run "pnpm run build:go2rtc" and "pnpm --filter @smarteverything/desktop run build".';
  return {
    controller: primary.controller,
    companion,
    launch: primary.launch,
    checkResources: (): void => {
      const entry = isFile(paths.serviceEntry);
      const go2rtc = isFile(paths.go2rtcBinary);
      if (!entry) {
        throw new ServiceResourceMissingError('The server program', paths.serviceEntry, remedy);
      }
      if (!go2rtc) {
        throw new ServiceResourceMissingError('go2rtc', paths.go2rtcBinary, remedy);
      }
    },
  };
}
