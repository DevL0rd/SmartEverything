import type { HostStore } from '../store/host/host-store';
import { machineLabel, machineOfClient } from './machine';

export function senderNote(store: HostStore, clientId: string | null): string | null {
  if (clientId === null) return null;
  const client = store.clients.find(clientId);
  if (client === undefined) return null;
  return machineLabel(machineOfClient(store, client));
}
