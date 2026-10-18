import { CLIENT_PREFS, ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';

export function speechTextShown(store: Store, clientId: string): boolean {
  const owner = { clientId, profileId: store.profiles.activeOf(clientId).id };
  const read = store.personal.pref(CLIENT_PREFS.ai_speech, owner);
  if (read.status === 'invalid') {
    throw new ApiError('conflict', read.reason);
  }
  return read.value.showText;
}
