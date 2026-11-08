import { useRef, type ReactNode } from 'react';
import type { View } from 'react-native';
import {
  withRole,
  type DevicePresentation,
  type PresentedCapability,
  type VacuumValues,
} from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import type { Device } from '../../../../store/state';
import { useAction } from '../../controls/use-action';
import { readingOf, valueOrNull } from '../model/readings';
import { stationOf, type StationAction } from '../sections/dock-model';

export interface StationStop {
  readonly action: StationAction;
  readonly presented: PresentedCapability;
  readonly progress: number | null;
}

export function stationStopOf(
  presentation: DevicePresentation,
  values: VacuumValues,
): StationStop | null {
  const station = valueOrNull(readingOf(() => stationOf(values)));
  const action = station?.stop ?? null;
  if (station === null || action === null) {
    return null;
  }
  const presented = withRole(presentation, action.role);
  return presented === undefined ? null : { action, presented, progress: station.progress };
}

export function StationStopButton({
  device,
  stop,
}: {
  readonly device: Device;
  readonly stop: StationStop;
}): ReactNode {
  const opener = useRef<View>(null);
  const handle = useAction(device, stop.presented, opener);
  return (
    <>
      <Button
        label={stop.action.label}
        icon={stop.action.icon}
        variant="outlined"
        loading={handle.pending}
        disabled={!device.online}
        ref={opener}
        onPress={handle.run}
      />
      {handle.sheet}
    </>
  );
}
