import type { MachineUpdateStatus } from '@smarteverything/domain';

export type UpdateRow =
  | {
      readonly kind: 'action';
      readonly title: string;
      readonly subtitle: string;
      readonly act: 'check' | 'install';
    }
  | {
      readonly kind: 'info';
      readonly title: string;
      readonly value: string;
      readonly subtitle: string;
    };

export function updateRowOf(status: MachineUpdateStatus): UpdateRow {
  switch (status.state) {
    case 'none':
      return { kind: 'action', title: 'Check for updates', subtitle: status.detail, act: 'check' };
    case 'available':
      return status.installable
        ? {
            kind: 'action',
            title: `Update to version ${status.version ?? ''}`,
            subtitle: status.detail,
            act: 'install',
          }
        : {
            kind: 'info',
            title: `Version ${status.version ?? ''} is available`,
            value: 'Not here',
            subtitle: status.detail,
          };
    case 'downloading':
      return { kind: 'info', title: 'Updating', value: 'Downloading…', subtitle: status.detail };
    case 'installing':
      return { kind: 'info', title: 'Updating', value: 'Installing…', subtitle: status.detail };
    case 'failed':
      return {
        kind: 'action',
        title: 'Check for updates again',
        subtitle: status.detail,
        act: 'check',
      };
  }
}
