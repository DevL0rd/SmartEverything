import { VACUUM_FAULT_KEY, parseVacuumFault, type JsonValue } from '@smarteverything/domain';
import { useDeviceDerived } from '../../../../store/selectors';
import type { DeviceValues } from '../../../../store/state';

export interface VacuumFault {
  readonly title: string;
  readonly hint: string | null;
  readonly canHelp: boolean;
}

export function faultOfText(text: JsonValue | undefined): VacuumFault | null {
  const fault = parseVacuumFault(text);
  if (fault === null) {
    return null;
  }
  return {
    title:
      fault.title === ''
        ? `Fault ${String(fault.code)}. Xiaomi gives no description for this code.`
        : fault.title,
    hint: fault.hint === '' ? null : fault.hint,
    canHelp: fault.canHelp,
  };
}

export function faultOfValues(values: DeviceValues): VacuumFault | null {
  return faultOfText(values[VACUUM_FAULT_KEY]?.value);
}

export function useVacuumFault(deviceId: string): VacuumFault | null {
  return useDeviceDerived(deviceId, faultOfValues, []);
}
