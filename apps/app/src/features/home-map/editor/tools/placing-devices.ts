import type { Device } from '../../../../store/state';
import { sameJson } from '../../../../store/same-json';
import { useStoreSelector } from '../../../../store/store-context';
import { modelSubjectOf } from '../../../models';
import { sameFields, sameRows, shownDevices } from '../../data/map-devices';

const PLACING_FIELDS = [
  'id',
  'label',
  'room_id',
  'parent_id',
  'kind',
  'model',
  'manufacturer',
  'capabilities',
] as const satisfies readonly (keyof Device)[];

const samePlacingFields = sameFields<Device>(PLACING_FIELDS);

export const samePlacingDevices = sameRows<Device>(
  (left, right) =>
    samePlacingFields(left, right) && sameJson(modelSubjectOf(left), modelSubjectOf(right)),
);

export function usePlacingDevices(): readonly Device[] {
  return useStoreSelector(shownDevices, samePlacingDevices);
}
