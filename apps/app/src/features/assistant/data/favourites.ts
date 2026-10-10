import { CLIENT_PREFS } from '@smarteverything/domain';
import { usePref } from '../../../store/prefs';

export type FavouriteModels =
  | {
      readonly status: 'ready';
      readonly favourites: ReadonlySet<string>;
      readonly toggle: (modelId: string) => void;
    }
  | { readonly status: 'invalid'; readonly reason: string; readonly reset: () => void };

export function useFavouriteModels(): FavouriteModels {
  const pref = usePref(CLIENT_PREFS.ai_models);
  if (pref.status === 'invalid') {
    return { status: 'invalid', reason: pref.reason, reset: pref.reset };
  }
  const list = pref.value.favourites;
  return {
    status: 'ready',
    favourites: new Set(list),
    toggle: (modelId: string): void => {
      pref.set({
        favourites: list.includes(modelId)
          ? list.filter((id) => id !== modelId)
          : [...list, modelId].slice(-100),
      });
    },
  };
}
