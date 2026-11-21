import type { ClientRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';

export type PhoneDirectory = Pick<Store, 'host'>;

export async function phonesOf(
  store: PhoneDirectory,
  profileId: string,
): Promise<readonly ClientRow[]> {
  return (await store.host.call('clients', 'list')).filter(
    (client) => client.platform === 'android' && client.profile_id === profileId,
  );
}
