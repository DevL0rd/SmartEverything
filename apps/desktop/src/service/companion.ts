import { Logger } from '@smarteverything/logging';
import { parseServiceConfigText } from '@smarteverything/hub/service/configuration';
import type { ServiceController } from './controller.js';
import type { ServiceLaunch } from './definitions.js';
import type { ServiceLocations } from './locations.js';
import type { ServiceManager } from './manager.js';
import type { ServiceSystem } from './system.js';

const log = new Logger('desktop.service');

export interface CompanionPort {
  readonly controller: Pick<ServiceController, 'ensure' | 'uninstall'>;
  readonly manager: Pick<ServiceManager, 'state'>;
  readonly locations: Pick<ServiceLocations, 'configFile'>;
  readonly system: Pick<ServiceSystem, 'files'>;
}

export interface Companion extends CompanionPort {
  readonly controller: ServiceController;
  readonly manager: ServiceManager;
  readonly locations: ServiceLocations;
  readonly system: ServiceSystem;
  readonly launch: ServiceLaunch;
}

export type CompanionOutcome = 'running' | 'removed' | 'unpaired';

export async function companionPaired(
  companion: Pick<CompanionPort, 'locations' | 'system'>,
): Promise<boolean> {
  const { configFile } = companion.locations;
  const text = await companion.system.files.read(configFile);
  return text !== null && parseServiceConfigText(configFile, text).role === 'node';
}

export async function reconcileCompanion(
  companion: CompanionPort,
  firstInstall: () => void,
): Promise<CompanionOutcome> {
  const before = await companion.manager.state();
  if (!(await companionPaired(companion))) {
    if (!before.installed) return 'unpaired';
    log.info('service.companion_unpaired', {});
    await companion.controller.uninstall();
    return 'removed';
  }
  await companion.controller.ensure();
  if (!before.installed) firstInstall();
  log.info('service.companion_running', { adopted: before.installed && !before.current });
  return 'running';
}
