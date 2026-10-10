import { z } from 'zod';
import { READS, defineTool, type Tool } from './registry';

export const PEOPLE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_people',
    input: z.strictObject({}),
    annotations: READS,
    run: ({ store }) => {
      const clients = store.clients.list();
      return {
        structured: {
          people: store.profiles.list().map((profile) => ({
            ...profile,
            apps: clients
              .filter((client) => store.profiles.activeOf(client.id).id === profile.id)
              .map((client) => ({
                id: client.id,
                name: client.name,
                platform: client.platform,
                role: client.role,
              })),
          })),
        },
      };
    },
  }),
];
