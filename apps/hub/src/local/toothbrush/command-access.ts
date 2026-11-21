import type { ClientRow } from '@smarteverything/domain';
import { effectiveRow } from '../../server/person-access-units';
import type { HostStore } from '../../store/host/host-store';

const OWNER_SOURCES: ReadonlySet<string> = new Set(['automation']);

export function commandRoleOf(
  store: Pick<HostStore, 'commands' | 'clients' | 'profiles' | 'personAccess'>,
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
