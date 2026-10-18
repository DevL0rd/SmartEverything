import { withRole } from '@smarteverything/domain';
import { deviceValuesOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { deviceModelOf } from '../model/device-model';

export const DRAWING_WATTS = 5;

export interface Confirmation {
  readonly on: boolean;
  readonly by: string;
  readonly watts: number;
}

export function isDrawing(watts: number): boolean {
  return watts >= DRAWING_WATTS;
}

export function readConfirmation(state: StoreState, deviceId: string | null): Confirmation | null {
  const device = deviceId === null ? undefined : state.tables.devices.byId[deviceId];
  if (device?.online !== true) {
    return null;
  }
  const draw = withRole(deviceModelOf(device).presentation, 'power_draw');
  const watts = draw === undefined ? undefined : deviceValuesOf(state, device.id)[draw.key]?.value;
  return typeof watts === 'number' ? { on: isDrawing(watts), by: device.label, watts } : null;
}

function sameConfirmation(left: Confirmation | null, right: Confirmation | null): boolean {
  return (
    left === right ||
    (left?.on === right?.on && left?.by === right?.by && left?.watts === right?.watts)
  );
}

export function useConfirmation(deviceId: string | null): Confirmation | null {
  return useStoreSelector((state) => readConfirmation(state, deviceId), sameConfirmation, [
    deviceId,
  ]);
}
