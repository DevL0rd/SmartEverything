import { PROVIDERS } from '@smarteverything/domain';
import { z } from 'zod';
import { reported, sendAndWait } from './commanding';
import { READS, WRITES, defineTool, type Tool } from './registry';
import { placedDevices } from './targets';

const NOTHING = z.strictObject({});

export const HOME_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_homes',
    input: NOTHING,
    annotations: READS,
    run: ({ store }) => {
      const settings = store.settings.read();
      return {
        structured: {
          homes: [
            {
              name: settings.home_name,
              time_zone: settings.time_zone,
              latitude: settings.latitude,
              longitude: settings.longitude,
              role: 'owner',
              rooms: store.rooms.list().length,
              devices: store.devices.list().length,
              people: store.profiles.list().length,
            },
          ],
        },
      };
    },
  }),
  defineTool({
    name: 'list_rooms',
    input: NOTHING,
    annotations: READS,
    run: ({ store }) => {
      const devices = placedDevices(store);
      return {
        structured: {
          rooms: store.rooms.list().map((room) => ({
            id: room.id,
            name: room.name,
            position: room.position,
            devices: devices
              .filter((placed) => placed.room?.id === room.id)
              .map(({ name, device, family }) => ({
                id: device.id,
                name,
                family,
                online: device.online,
              })),
          })),
          unplaced: devices
            .filter((placed) => placed.room === null)
            .map(({ name, device, family }) => ({
              id: device.id,
              name,
              family,
            })),
        },
      };
    },
  }),
  defineTool({
    name: 'list_providers',
    input: NOTHING,
    annotations: READS,
    run: ({ store }) => ({
      structured: {
        providers: store.providers.list().map((link) => ({
          provider: link.provider,
          status: link.status,
          account_label: link.account_label,
          last_error: link.last_error,
          device_count: link.device_count,
          waiting_for: link.prompt === null ? null : link.prompt.kind,
          updated_at: link.updated_at,
        })),
        sign_in:
          'Linking or re-linking an account needs the person in the app (Settings › Connections).',
      },
    }),
  }),
  defineTool({
    name: 'sync_provider',
    input: z.strictObject({
      provider: z
        .enum(PROVIDERS)
        .nullable()
        .default(null)
        .describe('One provider, or null for all'),
    }),
    annotations: { ...WRITES, idempotentHint: true, openWorldHint: true },
    run: async (context, input) => {
      const outcome = await sendAndWait(context, [
        { device_id: null, capability: 'hub:discover', value: { provider: input.provider } },
      ]);
      return { structured: reported(context, outcome) };
    },
  }),
];
