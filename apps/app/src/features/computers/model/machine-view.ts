import {
  MACHINE_ACTIONS,
  MACHINE_PERMISSIONS,
  type MachineAction,
  type MachineActionSupport,
  type MachineGrantKind,
  type MachinePermissionState,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

interface ActionLook {
  readonly title: string;
  readonly icon: IconName;
}

const ACTION_LOOK: Readonly<Record<MachineAction, ActionLook>> = {
  ring: { title: 'Ring', icon: 'bell' },
  stop_ring: { title: 'Stop ringing', icon: 'bellOff' },
  flashlight: { title: 'Flashlight', icon: 'bulb' },
  launch_app: { title: 'Open an app', icon: 'appWindow' },
  open: { title: 'Open a link or file', icon: 'externalLink' },
  screenshot: { title: 'Screenshot', icon: 'image' },
  lock: { title: 'Lock', icon: 'lock' },
  unlock: { title: 'Unlock', icon: 'lockOpen' },
  show_unlock: { title: 'Show the unlock prompt', icon: 'lockOpen' },
  receive_file: { title: 'Receive files', icon: 'download' },
};

export interface ActionRow {
  readonly action: MachineAction;
  readonly title: string;
  readonly icon: IconName;
  readonly state: MachineActionSupport['state'];
  readonly detail: string | null;
}

export function actionRows(supports: readonly MachineActionSupport[]): readonly ActionRow[] {
  return MACHINE_ACTIONS.flatMap((action) => {
    const support = supports.find((item) => item.action === action);
    if (support === undefined) return [];
    const { title, icon } = ACTION_LOOK[action];
    return [
      {
        action,
        title,
        icon,
        state: support.state,
        detail: support.state === 'ready' ? null : support.reason,
      },
    ];
  });
}

export const ACTION_STATE_TEXT: Readonly<Record<MachineActionSupport['state'], string>> = {
  ready: 'Ready',
  needs_permission: 'Needs permission',
  unsupported: 'Not possible here',
};

const GRANT_HOW: Readonly<Record<MachineGrantKind, (label: string, machine: string) => string>> = {
  system_settings: (label, machine) => `Turn on ${label} in the system settings on ${machine}.`,
  run_once: (label, machine) =>
    `Take one screenshot of ${machine} and accept the ${label.toLowerCase()} prompt it shows.`,
  file_picker: (label, machine) => `Choose the folders on ${machine} for ${label.toLowerCase()}.`,
  elevation: (label, machine) => `${label} needs an administrator to allow it once on ${machine}.`,
};

export interface PermissionRow {
  readonly id: MachinePermissionState['permission'];
  readonly label: string;
  readonly granted: boolean;
  readonly how: string;
}

export function permissionRows(
  states: readonly MachinePermissionState[],
  machine: string,
): readonly PermissionRow[] {
  return states.map(({ permission, granted }) => {
    const { label, grant } = MACHINE_PERMISSIONS[permission];
    return { id: permission, label, granted, how: GRANT_HOW[grant](label, machine) };
  });
}
