import type { ReactNode } from 'react';
import { PickerSourceContext } from '../components/widget-board/picker-source';
import type { PickerState } from '../components/widget-board/types';
import { rowsOf, type StoreState } from './state';
import { useEntityStore, useStoreSelector } from './store-context';

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

export function PickerSourceProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const store = useEntityStore();
  const state = useStoreSelector(pickerStateOf, sameState);
  return (
    <PickerSourceContext value={{ state, read: () => pickerStateOf(store.get()) }}>
      {children}
    </PickerSourceContext>
  );
}
