import type { Store } from '../../store/store';

export function phoneClientsOf(
  store: Pick<Store, 'clients' | 'profiles'>,
  profileId: string | null,
  holder: string | null,
): string[] {
  const phones = store.clients
    .list()
    .filter(
      (client) =>
        client.platform === 'android' &&
        (profileId === null
          ? client.role === 'owner'
          : store.profiles.activeOf(client.id).id === profileId),
    )
    .map((client) => client.id);
  return holder !== null && phones.includes(holder) ? [holder] : phones;
}
