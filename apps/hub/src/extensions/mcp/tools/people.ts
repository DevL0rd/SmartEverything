import { z } from 'zod';
import type { Store } from '../../../store/store';
import { READS, defineTool, type Tool } from './registry';

export function peopleOf(store: Pick<Store, 'clients' | 'profiles'>): Record<string, unknown>[] {
  const clients = store.clients.list();
  return store.profiles.list().map((profile) => ({
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
    name: 'list_people',
    input: z.strictObject({}),
    annotations: READS,
    run: ({ store }) => ({ structured: { people: peopleOf(store) } }),
  }),
];
