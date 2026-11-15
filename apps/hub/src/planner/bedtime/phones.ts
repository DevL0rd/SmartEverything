import type { ClientRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export type PhoneDirectory = Pick<Store, 'clients'>;

export function phonesOf(store: PhoneDirectory, profileId: string): readonly ClientRow[] {
  return store.clients
    .list()
    .filter((client) => client.platform === 'android' && client.profile_id === profileId);
}
