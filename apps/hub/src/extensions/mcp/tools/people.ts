import { z } from 'zod';
import type { Store } from '../../../store/store';
import { READS, defineTool, type Tool } from './registry';

export async function peopleOf(store: Pick<Store, 'host'>): Promise<Record<string, unknown>[]> {
  const [clients, profiles] = await Promise.all([
    store.host.call('clients', 'list'),
    store.host.call('profiles', 'list'),
  ]);
  return profiles.map((profile) => ({
    ...profile,
    apps: clients
      .filter((client) => client.profile_id === profile.id)
      .map((client) => ({
        id: client.id,
        name: client.name,
        platform: client.platform,
        role: client.role,
      })),
  }));
}

export const PEOPLE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'person_read',
    input: z.strictObject({}),
    annotations: READS,
    run: async ({ store }) => ({ structured: { people: await peopleOf(store) } }),
  }),
];
