import type { MachineUpdateStatus } from '@smarteverything/domain';
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
        ? [{ label: `Update to version ${status.version ?? ''}`, click: actions.install }]
        : [{ label: status.detail, enabled: false }];
    case 'downloading':
    case 'installing':
      return [{ label: status.detail, enabled: false }];
    case 'failed':
      return [
        { label: status.detail, enabled: false },
        { label: 'Check for updates again', click: actions.check },
      ];
    case 'none':
      return [{ label: 'Check for updates', click: actions.check }];
  }
}

export function updateTrayItems(updates: UpdateController): MenuItemConstructorOptions[] {
  return updateMenuItems(updates.status(), {
    check: () => {
      background(updates.check(), 'update.check_failed');
    },
    install: () => {
      background(updates.install(), 'update.install_failed');
    },
  });
}
