import { presentValue, withRole } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import type { DeviceValues } from '../../../store/state';
import type { DeviceModel } from '../../devices';
import { DeviceFold } from './device-fold';

type SecurityRole = 'lock' | 'contact' | 'leak' | 'smoke' | 'gas';

const ROLES: readonly SecurityRole[] = ['lock', 'leak', 'smoke', 'gas', 'contact'];

const ALARMING: Readonly<Record<SecurityRole, boolean>> = {
  lock: false,
  contact: false,
  leak: true,
  smoke: true,
  gas: true,
};

export interface SecurityLine {
  readonly deviceId: string;
  readonly name: string;
  readonly state: string;
  readonly alert: boolean;
}

function stateText(role: SecurityRole, value: boolean, shown: string): string {
  if (role === 'lock') {
    return value ? 'Locked' : 'Unlocked';
  }
  return shown;
}

function alerting(role: SecurityRole, value: boolean): boolean {
  return role === 'lock' ? !value : ALARMING[role] && value;
}

function roleOf(model: DeviceModel): SecurityRole | undefined {
  return ROLES.find((candidate) => withRole(model.presentation, candidate) !== undefined);
}

function lineOf(model: DeviceModel, values: DeviceValues): SecurityLine | null {
  const { device, presentation } = model;
  const role = roleOf(model);
  const presented = role === undefined ? undefined : withRole(presentation, role);
  const value = presented === undefined ? undefined : values[presented.key]?.value;
  if (role === undefined || presented === undefined || typeof value !== 'boolean') {
    return null;
  }
  return {
    deviceId: device.id,
    name: device.label,
    state: device.online ? stateText(role, value, presentValue(presented, value)) : 'Offline',
    alert: device.online && alerting(role, value),
  };
}

const lines = new DeviceFold<SecurityLine>({
  includes: (model): boolean => roleOf(model) !== undefined,
  usesValues: (): boolean => true,
  projected: false,
  contribution: lineOf,
  same: (left, right): boolean =>
    left.name === right.name && left.state === right.state && left.alert === right.alert,
});

export function alertsFirst(lines: readonly SecurityLine[]): readonly SecurityLine[] {
  return [...lines.filter((line) => line.alert), ...lines.filter((line) => !line.alert)];
}

export const securityLines = memoOnInputs(
  (state) => [lines.read(state)],
  (state): readonly SecurityLine[] =>
    alertsFirst(lines.read(state).entries.map((entry) => entry.value)),
);

export function sameSecurity(
  left: readonly SecurityLine[],
  right: readonly SecurityLine[],
): boolean {
  return (
    left.length === right.length &&
    left.every((line, index) => {
      const other = right[index];
      return (
        other?.deviceId === line.deviceId &&
        other.name === line.name &&
        other.state === line.state &&
        other.alert === line.alert
      );
    })
  );
}
