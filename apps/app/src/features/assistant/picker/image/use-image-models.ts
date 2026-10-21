import { CLIENT_PREFS, IMAGE_AREA_ENDPOINTS as E } from '@smarteverything/domain';
import type {
  ImageEndpoint,
  ImageModelChoice,
  ImageProviderCatalog,
} from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { api } from '../../../../api/transport';
import { updateAssistantSettings } from '../../../../api/assistant';
import { notify } from '../../../../components/toast-store';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import { usePref } from '../../../../store/prefs';
import { useEntityStore } from '../../../../store/store-context';
import { useAssistantStatus } from '../../data/assistant-data';

const FIVE_MINUTES = 300_000;

export function useImageCatalog(): UseQueryResult<ImageProviderCatalog> {
  return useScreenQuery({
    queryKey: ['assistant', 'image-endpoints'],
    queryFn: () => api().call(E.listImageEndpoints, { query: {} }),
    staleTime: FIVE_MINUTES,
  });
}

export function useSelectedImageModel(): ImageModelChoice | null {
  return useAssistantStatus()?.settings.image_model ?? null;
}

export function useImageModelChange(): (choice: ImageModelChoice | null) => void {
  const store = useEntityStore();
  return (choice): void => {
    updateAssistantSettings({ image_model: choice })
      .then((status) => {
        store.update((state) => ({ ...state, assistant: status }));
      })
      .catch((error: unknown) => {
        notify({ message: 'The image model was not changed', error, tone: 'critical' });
      });
  };
}

export function takesReferences(endpoint: ImageEndpoint): boolean {
  return endpoint.parameters['input_references'] !== undefined;
}

export function sameChoice(endpoint: ImageEndpoint, choice: ImageModelChoice | null): boolean {
  return (
    choice !== null &&
    choice.model === endpoint.model &&
    choice.provider_tag === endpoint.provider_tag
  );
}

export function matchesQuery(endpoint: ImageEndpoint, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);
  const haystack = `${endpoint.name} ${endpoint.model} ${endpoint.provider_tag}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function favouriteKey(endpoint: Pick<ImageEndpoint, 'model' | 'provider_tag'>): string {
  return `${endpoint.model}|${endpoint.provider_tag}`;
}

export interface ImageFavourites {
  readonly favourites: ReadonlySet<string>;
  readonly toggle: (key: string) => void;
}

export function useImageFavourites(): ImageFavourites | null {
  const pref = usePref(CLIENT_PREFS.ai_models);
  if (pref.status === 'invalid') return null;
  const list = pref.value.image_favourites;
  return {
    favourites: new Set(list),
    toggle: (key): void => {
      pref.set({
        ...pref.value,
        image_favourites: list.includes(key) ? list.filter((id) => id !== key) : [...list, key],
      });
    },
  };
}
