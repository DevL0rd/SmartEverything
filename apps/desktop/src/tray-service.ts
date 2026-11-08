import { Logger } from '@smarteverything/logging';
import { reportFailure } from './failure.js';
import type { ServiceController } from './service/controller.js';
import type { TrayOptions } from './tray.js';

const log = new Logger('desktop.main');

export function logControlFailure(cause: unknown): void {
  reportFailure('The server control did not finish', cause);
}

export function trayServiceOf(controller: ServiceController): TrayOptions['service'] {
  const request = (action: 'start' | 'stop' | 'restart'): void => {
    log.info('tray.service_requested', { action });
    void controller[action]().catch(logControlFailure);
  };
  return {
    start: (): void => {
      request('start');
    },
    stop: (): void => {
      request('stop');
    },
    restart: (): void => {
      request('restart');
    },
  };
}
