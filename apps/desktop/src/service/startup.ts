import { Logger } from '@smarteverything/logging';
import { setStartOnLogin } from '../start-on-login.js';
import type { ServiceController } from './controller.js';

const log = new Logger('desktop.service');

export async function startComputer(controller: ServiceController): Promise<void> {
  if ((await controller.config()) === null) return;
  const before = await controller.status();
  if (before.installed && !before.active) return;
  const status = await controller.ensure();
  if (!before.installed) setStartOnLogin(true);
  log.info('computer.running', { manager: status.manager, active: status.active });
}
