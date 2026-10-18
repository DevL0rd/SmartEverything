import { isLocalScale } from '../../store/people';
import { rowsOf, type StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';

export function hasScale(state: StoreState): boolean {
  return rowsOf(state.tables.devices).some(isLocalScale);
}

export function useHasScale(): boolean {
  return useStoreSelector(hasScale);
}
