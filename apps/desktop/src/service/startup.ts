import type { DesktopPlatform } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DesktopService } from './desktop-service.js';
import { reportFailure as reportDialog } from '../failure.js';
import { setStartOnLogin } from '../start-on-login.js';
import { reconcileCompanion } from './companion.js';
import { confirmServiceInstall, showServiceFailure } from './dialogs.js';

const log = new Logger('desktop.service');

export type StartupOutcome = 'running' | 'declined' | 'failed';

async function reportFailure(service: DesktopService, error: unknown): Promise<void> {
  log.error('desktop.service.start_failed', error);
  const logs = await service.controller.logs().catch((cause: unknown) => {
    log.error('desktop.service.logs_unreadable', cause);
    return { lines: [] };
  });
  showServiceFailure(error, logs.lines);
}

export interface StartupMode {
  readonly unattended: boolean;
}

async function acceptsInstall(
  platform: DesktopPlatform,
  service: DesktopService,
  mode: StartupMode,
): Promise<boolean> {
  if (mode.unattended) {
    log.info('desktop.service.unattended_install', {
      dataDirectory: service.controller.dataDirectory,
    });
    return true;
  }
  return confirmServiceInstall({
    platform,
    dataDirectory: service.controller.dataDirectory,
  });
}

async function startCompanion(service: DesktopService): Promise<void> {
  try {
    const outcome = await reconcileCompanion(service.companion, () => {
      setStartOnLogin(true);
    });
    log.info('desktop.service.companion', { outcome });
  } catch (error: unknown) {
    log.error('desktop.service.companion_failed', error);
    reportDialog('The computer client did not start', error);
  }
}

export async function startService(
  platform: DesktopPlatform,
  service: DesktopService,
  mode: StartupMode,
): Promise<StartupOutcome> {
  const { controller } = service;
  const node = (await controller.config()).role === 'node';
  const before = await controller.status();
  if (before.health === 'not-installed' && !(await acceptsInstall(platform, service, mode))) {
    return 'declined';
  }
  try {
    if (!node) service.checkResources();
    const status = await controller.ensure();
    log.info('desktop.service.running', { url: status.url, manager: status.manager });
  } catch (error: unknown) {
    await reportFailure(service, error);
    return 'failed';
  }
  if (!node) await startCompanion(service);
  return 'running';
}
