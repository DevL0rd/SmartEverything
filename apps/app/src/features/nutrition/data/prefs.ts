import { CLIENT_PREFS, type NutritionPref } from '@smarteverything/domain';
import { PREFS, savePref, usePref, type PrefRead } from '../../../store/prefs';
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
  return (
    CLIENT_PREFS.nutrition.decode(
      state.tables.layouts.byId[CLIENT_PREFS.nutrition.storageKey]?.layout ?? null,
    ).status !== 'invalid'
  );
}

export function nutritionPrefsOf(state: StoreState): NutritionPref {
  const read = CLIENT_PREFS.nutrition.decode(
    state.tables.layouts.byId[CLIENT_PREFS.nutrition.storageKey]?.layout ?? null,
  );
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
