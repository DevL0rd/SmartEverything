import { useMemo } from 'react';
import type { CapabilityKey, CapabilityRole, DevicePresentation } from '@smarteverything/domain';
import { useDeviceDerived } from '../../../../store/selectors';
import type { Device } from '../../../../store/state';
import { useDeviceModel } from '../../model/device-model';
import { keyOfRole, sameSnapshot, snapshotOf, type VacuumSnapshot } from './snapshot';

export interface Vacuum {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly snapshot: VacuumSnapshot;
  readonly keyOf: (role: CapabilityRole) => CapabilityKey | undefined;
}

export function useVacuum(device: Device): Vacuum {
  const { presentation } = useDeviceModel(device);
  const online = device.online;
  const snapshot = useDeviceDerived(
    device.id,
    (values) => snapshotOf(presentation, values, online),
    [presentation, online],
    sameSnapshot,
  );
  return useMemo(
    () => ({ device, presentation, snapshot, keyOf: (role) => keyOfRole(presentation, role) }),
    [device, presentation, snapshot],
  );
}
