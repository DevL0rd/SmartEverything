import { rowsOf, type StoreState } from '../../store/state';
import { useEntityStore, useStoreSelector } from '../../store/store-context';
import type { PickerState } from './types';

interface PickerSource {
  readonly state: PickerState;
  readonly read: () => PickerState;
}

function pickerStateOf(state: StoreState): PickerState {
  return {
    devices: rowsOf(state.tables.devices),
    rooms: rowsOf(state.tables.rooms),
    groups: rowsOf(state.tables.device_groups),
  };
}

function sameState(left: PickerState, right: PickerState): boolean {
  return (
    left.devices === right.devices && left.rooms === right.rooms && left.groups === right.groups
  );
}

export function usePickerSource(): PickerSource {
  const store = useEntityStore();
  return {
    state: useStoreSelector(pickerStateOf, sameState),
    read: () => pickerStateOf(store.get()),
  };
}
