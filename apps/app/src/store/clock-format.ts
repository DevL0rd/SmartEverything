import { PREFS, prefValueOf } from './prefs';
import type { StoreState } from './state';
import { useStoreSelector } from './store-context';

export function hour24Of(state: StoreState): boolean {
  return prefValueOf(state, PREFS.clockFormat).hour24;
}

export function useHour24(): boolean {
  return useStoreSelector(hour24Of);
}
