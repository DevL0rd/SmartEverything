import { useMemo, type ReactNode } from 'react';
import { PickerSourceContext, type PickerSource } from '../components/widget-board/picker-source';
import type { PickerState } from '../components/widget-board/types';
import type { EntityStore } from './entity-store';
import { rowsOf, type StoreState } from './state';
import { useEntityStore } from './store-context';
import { trackReads } from './subscriptions';

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

export function pickerSourceOf(store: EntityStore): PickerSource {
  const first = trackReads(store.get(), pickerStateOf);
  const slices = [...first.reads];
  let last = first.value;
  const read = (): PickerState => {
    const next = pickerStateOf(store.get());
    if (!sameState(last, next)) last = next;
    return last;
  };
  const subscribe = (wake: () => void): (() => void) => store.subscribeSlices(slices, wake);
  return { read, subscribe };
}

export function PickerSourceProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const store = useEntityStore();
  const source = useMemo(() => pickerSourceOf(store), [store]);
  return <PickerSourceContext value={source}>{children}</PickerSourceContext>;
}
