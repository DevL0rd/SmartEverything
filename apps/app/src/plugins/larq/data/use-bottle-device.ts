import { deviceFamily } from '@smarteverything/domain';
import { useMatchingDevices } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { activeProfileIn } from '../../../store/people';
import type { Device, StoreState } from '../../../store/state';
import { bottleOfPerson } from '../model/bottle-model';

export function isBottle(device: Device): boolean {
  return deviceFamily(device) === 'bottle';
}

const selectProfileId = (state: StoreState): string | null => activeProfileIn(state)?.id ?? null;

export function useBottleDevice(): Device | null {
  const bottles = useMatchingDevices(isBottle);
  return bottleOfPerson(bottles, useStoreSelector(selectProfileId));
}
