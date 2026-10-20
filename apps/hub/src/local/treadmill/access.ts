import type { DeviceRow, Starter } from '@smarteverything/domain';
import { effectiveRow } from '../../server/person-access';
import type { Store } from '../../store/store';

export interface AccessDeps {
  readonly store: Pick<Store, 'commands' | 'clients' | 'profiles' | 'personAccess'>;
  readonly holderOf: (device: DeviceRow) => string | null;
  readonly walkerOf: (device: DeviceRow) => string | null;
}

const OWNER_SOURCES: ReadonlySet<string> = new Set(['automation', 'scene']);

export function starterOf(deps: AccessDeps, device: DeviceRow, commandId: string): Starter {
  const row = deps.store.commands.byId(commandId);
  const clientId = row.requested_by;
  const owner =
    clientId === null
      ? OWNER_SOURCES.has(row.source)
      : effectiveRow(deps.store, deps.store.clients.byId(clientId)).role === 'owner';
  const walker = deps.walkerOf(device);
  const isWalker =
    clientId !== null && walker !== null && deps.store.profiles.activeOf(clientId).id === walker;
  const onHolder = row.source === 'app' && clientId !== null && clientId === deps.holderOf(device);
  return { owner, walker: isWalker, remote: !onHolder };
}
