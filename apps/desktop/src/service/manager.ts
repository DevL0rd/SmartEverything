import type { DesktopLinger, DesktopServiceManager } from '@smarteverything/domain';
import type { ServiceLaunch, ServiceNames } from './definitions.js';
import type { ServiceLocations } from './locations.js';
import type { ServiceSystem } from './system.js';

export interface ManagerState {
  readonly installed: boolean;
  readonly current: boolean;
  readonly active: boolean;
  readonly detail: string;
}

export interface ServiceManager {
  readonly kind: DesktopServiceManager;
  readonly state: () => Promise<ManagerState>;
  readonly install: () => Promise<void>;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly restart: () => Promise<void>;
  readonly uninstall: () => Promise<void>;
  readonly restoreOriginal: () => Promise<boolean>;
  readonly linger: () => Promise<DesktopLinger>;
  readonly enableLinger: () => Promise<void>;
}

export interface ManagerContext {
  readonly names: ServiceNames;
  readonly launch: ServiceLaunch;
  readonly locations: ServiceLocations;
  readonly system: ServiceSystem;
  readonly user: { readonly name: string; readonly uid: number };
}

export class LingerUnsupportedError extends Error {
  constructor(manager: DesktopServiceManager) {
    super(
      `keeping the server running while signed out needs systemd's lingering; this computer uses ${manager}`,
    );
    this.name = 'LingerUnsupportedError';
  }
}

export const DEFINITION_MODE = 0o644;
export const PRIVATE_MODE = 0o600;
