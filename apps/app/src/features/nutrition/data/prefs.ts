import type { NutritionPref } from '@smarteverything/domain';
import { PREFS, prefOf, savePref, usePref, type PrefRead } from '../../../store/prefs';
import type { EntityStore } from '../../../store/entity-store';
import type { StoreState } from '../../../store/state';

class NutritionPrefInvalidError extends Error {
  override readonly name = 'NutritionPrefInvalidError';
}

export function useNutritionPrefRead(): PrefRead<NutritionPref> {
  return usePref(PREFS.nutrition);
}

export function useNutritionPrefs(): NutritionPref | null {
  const pref = usePref(PREFS.nutrition);
  return pref.status === 'ready' ? pref.value : null;
}

export function nutritionReady(state: StoreState): boolean {
  return prefOf(state, PREFS.nutrition).status !== 'invalid';
}

export function nutritionPrefsOf(state: StoreState): NutritionPref {
  const read = prefOf(state, PREFS.nutrition);
  if (read.status === 'invalid') {
    throw new NutritionPrefInvalidError(read.reason);
  }
  return read.value;
}

export function saveNutritionPrefs(
  store: EntityStore,
  change: Partial<NutritionPref>,
): Promise<void> {
  savePref(store, PREFS.nutrition, { ...nutritionPrefsOf(store.get()), ...change });
  return Promise.resolve();
}
