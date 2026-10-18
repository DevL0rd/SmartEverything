import { useMemo } from 'react';
import type { CapabilityKey, CapabilityRole, DevicePresentation } from '@smarteverything/domain';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDeviceModel } from '../model/device-model';
import { laundryActions, type LaundryAction } from './actions';
import { keyOfRole, rolesOf, sameSnapshot, snapshotOf, type LaundrySnapshot } from './snapshot';
import { laundryStateOf, type LaundryState } from './state';

export interface Laundry {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly snapshot: LaundrySnapshot;
  readonly state: LaundryState;
  readonly roles: ReadonlySet<CapabilityRole>;
  readonly actions: readonly LaundryAction[];
  readonly keyOf: (role: Parameters<typeof keyOfRole>[1]) => CapabilityKey | undefined;
}

export function laundryOf(
  device: Device,
  presentation: DevicePresentation,
  snapshot: LaundrySnapshot,
): Laundry {
  const state = laundryStateOf(snapshot);
  const roles = rolesOf(presentation);
  const door = typeof snapshot.values.door_state === 'string' ? snapshot.values.door_state : null;
  return {
    device,
    presentation,
    snapshot,
    state,
    roles,
    actions: laundryActions(state, door, roles),
    keyOf: (role) => keyOfRole(presentation, role),
  };
}

export function useLaundry(device: Device): Laundry {
  const { presentation } = useDeviceModel(device);
  const online = device.online;
  const snapshot = useDeviceDerived(
    device.id,
    (values) => snapshotOf(presentation, values, online),
    [presentation, online],
    sameSnapshot,
  );
  return useMemo(() => laundryOf(device, presentation, snapshot), [device, presentation, snapshot]);
}
