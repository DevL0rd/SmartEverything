import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../api/transport';
import { notify } from '../components/toast-store';
import type { EntityStore } from './entity-store';

const log = new Logger('app.live');

export function loadOwnerConsents(
  store: EntityStore,
  owner: boolean,
  current: () => boolean,
): void {
  if (!owner) return;
  read(store, current).catch((error: unknown) => {
    log.error('live.consents_failed', error);
    notify({ message: 'Waiting assistant requests could not be read', error, tone: 'critical' });
  });
}

async function read(store: EntityStore, current: () => boolean): Promise<void> {
  const requests = await api().call(E.listMcpConsents, {});
  if (current()) store.update((state) => ({ ...state, consentRequests: requests }));
}
