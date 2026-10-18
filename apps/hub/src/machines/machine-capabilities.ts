import {
  CAPABILITY_CATALOGUE,
  MACHINE_ACTION_CAPABILITY,
  PHONE_FLASHLIGHT_MODES,
  reportedMachineActions,
  type DeviceCapability,
  type MachineAction,
  type MachineActionSupport,
  type ValueDescriptor,
} from '@smarteverything/domain';

const TEXT_LONGEST = 2048;

const ACTION_VALUE: ValueDescriptor = { kind: 'action' };

const VALUES: Readonly<Record<MachineAction, ValueDescriptor | null>> = {
  ring: ACTION_VALUE,
  stop_ring: ACTION_VALUE,
  flashlight: { kind: 'enum', options: [...PHONE_FLASHLIGHT_MODES] },
  launch_app: { kind: 'text', maxLength: TEXT_LONGEST },
  open: { kind: 'text', maxLength: TEXT_LONGEST },
  screenshot: null,
  lock: ACTION_VALUE,
  unlock: ACTION_VALUE,
  show_unlock: ACTION_VALUE,
  receive_file: null,
};

export function machineCapabilities(
  supports: readonly MachineActionSupport[],
  offered: readonly MachineAction[],
): readonly DeviceCapability[] {
  return reportedMachineActions(supports).flatMap(({ action }) => {
    const key = MACHINE_ACTION_CAPABILITY[action];
    const value = VALUES[action];
    if (key === null || value === null || !offered.includes(action)) {
      return [];
    }
    return [{ key, label: CAPABILITY_CATALOGUE[key].label, access: 'write', value }];
  });
}
