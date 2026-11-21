import type { Store } from '../store/store';
import { storeUnit } from '../store/host/unit';
import { modelRefusal } from '../server/person-scope';
import { modelAllowed } from '../server/person-scope-units';

export const MODEL_ALLOWED_UNIT = storeUnit(
  (store, input: { readonly profileId: string; readonly model: string }): boolean =>
    modelAllowed(store, input.profileId, input.model),
);

export async function assertModelAllowedOf(
  store: Pick<Store, 'host'>,
  profileId: string,
  model: string,
): Promise<void> {
  if (await store.host.read('assistantModelAllowed', { profileId, model })) return;
  throw modelRefusal(store, profileId, model);
}
