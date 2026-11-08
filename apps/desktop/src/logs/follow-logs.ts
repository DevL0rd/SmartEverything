import { Logger } from '@smarteverything/logging';
import { app } from 'electron';
import type { ServiceController } from '../service/controller.js';
import { nodeSystem } from '../service/system.js';
import { DesktopLogShipping } from './shipment.js';

export function followLogs(controller: ServiceController): DesktopLogShipping {
  Logger.configure({ context: { platform: 'server', release: app.getVersion() } });
  const logs = new DesktopLogShipping({
    directory: app.getPath('userData'),
    fetch: nodeSystem.fetch,
  });
  controller.onConnection((server) => {
    logs.follow(server);
  });
  controller.onChange((status) => {
    if (status.health !== 'running') logs.pause();
  });
  return logs;
}
