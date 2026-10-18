import { randomUUID } from 'expo-crypto';
import { api } from '../../../api/transport';

const connections = new WeakMap<ReturnType<typeof api>, string>();
export function connectionId(live: boolean): string {
  if (!live) return 'offline';
  const client = api();
  const existing = connections.get(client);
  if (existing !== undefined) return existing;
  const id = randomUUID();
  connections.set(client, id);
  return id;
}
