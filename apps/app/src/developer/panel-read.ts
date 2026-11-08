import { useStoreSelector } from '../store/store-context';
import type { StoreState } from '../store/state';
import { personLevel, unlockedIn } from './panel';

const selectUnlocked = (state: StoreState): boolean => unlockedIn(state);

const selectInherited = (state: StoreState): boolean => personLevel(state) === 'on';

export function useDeveloperOn(): boolean {
  return useStoreSelector(selectUnlocked, Object.is, []);
}

export function useDeveloperInherited(): boolean {
  return useStoreSelector(selectInherited, Object.is, []);
}
