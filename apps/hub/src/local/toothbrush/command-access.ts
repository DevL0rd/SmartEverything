import type { ClientRow } from '@smarteverything/domain';
import { effectiveRow } from '../../server/person-access';
import type { Store } from '../../store/store';

const OWNER_SOURCES: ReadonlySet<string> = new Set(['automation', 'scene']);

export function commandRoleOf(
  store: Pick<Store, 'commands' | 'clients' | 'profiles' | 'personAccess'>,
  commandId: string,
): ClientRow['role'] {
  const row = store.commands.byId(commandId);
  if (OWNER_SOURCES.has(row.source)) {
    return 'owner';
  }
  return row.requested_by === null
    ? 'member'
    : effectiveRow(store, store.clients.byId(row.requested_by)).role;
}
