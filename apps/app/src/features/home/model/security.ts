import { presentValue, withRole } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import type { StoreState } from '../../../store/state';
import type { DeviceModel } from '../../devices';
import { homeDeviceModels } from './devices';

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

function lineOf(state: StoreState, model: DeviceModel): SecurityLine | null {
  const { device, presentation } = model;
  const role = ROLES.find((candidate) => withRole(presentation, candidate) !== undefined);
  const presented = role === undefined ? undefined : withRole(presentation, role);
  const value =
    presented === undefined ? undefined : state.deviceValues[device.id]?.[presented.key]?.value;
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

export const securityLines = memoOnInputs(
  (state) => [state.tables.devices, state.deviceValues],
  (state): readonly SecurityLine[] =>
    homeDeviceModels(state).flatMap((model) => {
      const line = lineOf(state, model);
      return line === null ? [] : [line];
    }),
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
