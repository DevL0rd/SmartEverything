import type { DesktopDriveState, DesktopDriveCommand } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { reportFailure } from './failure.js';
import type { ServiceController } from './service/controller.js';
import type { DriveControlClient } from './drive-mount/control-client.js';

import type { DriveTrayCommands, DriveTrayState, TrayOptions } from './tray.js';
import { traySyncOf } from './tray-status.js';

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

type DriveTrayClient = Pick<DriveControlClient, 'run' | 'onState' | 'current'>;

export interface DriveTrayLink {
  readonly commands: DriveTrayCommands;
  readonly follow: (tray: DriveTrayState) => () => void;
}

export function trayDriveOf(client: DriveTrayClient): DriveTrayLink {
  const send = (command: DesktopDriveCommand): void => {
    log.info('tray.drive_requested', { kind: command.kind });
    void client.run(command).catch(logControlFailure);
  };
  return {
    commands: {
      sync: (command): void => {
        send({ kind: command.kind === 'pause' ? 'sync-pause' : 'sync-resume' });
      },
      mount: (): void => {
        send({ kind: 'again' });
      },
    },
    follow: (tray): (() => void) => {
      const show = (state: DesktopDriveState | null): void => {
        tray.sync(state === null ? null : traySyncOf(state.sync));
        tray.mount(state === null ? null : state.mount);
      };
      show(client.current);
      return client.onState(show);
    },
  };
}
