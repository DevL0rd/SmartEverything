import type { MachineUpdateStatus, WebUpdateStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { MenuItemConstructorOptions } from 'electron';
import type { UpdateController } from './update-controller.js';

export interface UpdateActions {
  readonly check: () => void;
  readonly install: () => void;
}

export function updateMenuItems(
  status: MachineUpdateStatus,
  actions: UpdateActions,
): MenuItemConstructorOptions[] {
  switch (status.state) {
    case 'available':
      return status.installable
        ? [{ label: `Install desktop version ${status.version ?? ''}`, click: actions.install }]
        : [{ label: status.detail, enabled: false }];
    case 'downloading':
      return [{ label: downloadLabel(status), enabled: false }];
    case 'installing':
      return [{ label: status.detail, enabled: false }];
    case 'failed':
      return [
        { label: status.detail, enabled: false },
        { label: 'Check for desktop updates again', click: actions.check },
      ];
    case 'none':
      return [
        { label: status.detail, enabled: false },
        { label: 'Check for desktop updates', click: actions.check },
      ];
  }
}

function downloadLabel(status: MachineUpdateStatus): string {
  return status.progress === null
    ? status.detail
    : `Downloading desktop version ${status.version ?? ''} · ${String(downloadedPercent(status.progress))}%`;
}

export function webUpdateMenuItems(
  status: WebUpdateStatus,
  askToRestart: () => void,
): MenuItemConstructorOptions[] {
  if (status.state === 'ready') {
    return [{ label: 'Restart for the interface update', click: askToRestart }];
  }
  if (status.state === 'rollback_ready') {
    return [{ label: 'Restart to return to the built-in interface', click: askToRestart }];
  }
  if (status.state === 'downloading') {
    return [
      {
        label: `Downloading interface update · ${String(downloadedPercent(status))}%`,
        enabled: false,
      },
    ];
  }
  return [];
}

function downloadedPercent(status: { readonly received: number; readonly total: number }): number {
  return status.total === 0 ? 0 : Math.floor((status.received * 100) / status.total);
}

export interface WebUpdateTray {
  readonly status: () => WebUpdateStatus;
  readonly askToRestart: () => void;
}

export function trayActions(
  updates: Pick<UpdateController, 'status' | 'check' | 'install'>,
): UpdateActions {
  return {
    check: (): void => {
      background(updates.check(), 'update.check_failed');
    },
    install: (): void => {
      const { offerId } = updates.status();
      if (offerId !== undefined) background(updates.install(offerId), 'update.install_failed');
    },
  };
}

export function updateTrayItems(
  updates: Pick<UpdateController, 'status' | 'check' | 'install'>,
  web: WebUpdateTray,
): MenuItemConstructorOptions[] {
  return [
    ...updateMenuItems(updates.status(), trayActions(updates)),
    ...webUpdateMenuItems(web.status(), web.askToRestart),
  ];
}
