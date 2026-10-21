import { PROVIDERS } from '@smarteverything/domain';
import { z } from 'zod';
import { roleOfCaller, type Caller } from '../../../server/auth';
import type { Store } from '../../../store/store';
import { callerFor } from './acting';
import { reported, sendAndWait } from './commanding';
import { deviceScopeOfActor } from './person-reach';
import { READS, WRITES, defineTool, type Tool } from './registry';
import { placedDevices } from './targets';

const NOTHING = z.strictObject({});

export function homesOf(store: Store, caller: Caller): Record<string, unknown> {
  const settings = store.settings.read();
  return {
    homes: [
      {
        name: settings.home_name,
        time_zone: settings.time_zone,
        latitude: settings.latitude,
        longitude: settings.longitude,
        role: roleOfCaller(caller),
        rooms: store.rooms.list().length,
        devices: store.devices.list().length,
        people: store.profiles.list().length,
      },
    ],
  };
}

export const HOME_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_homes',
    input: NOTHING,
    annotations: READS,
    run: (context) => ({ structured: homesOf(context.store, callerFor(context)) }),
  }),
  defineTool({
    name: 'list_rooms',
    input: NOTHING,
    annotations: READS,
    run: (context) => {
      const { store } = context;
      const devices = placedDevices(store, deviceScopeOfActor(context));
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
    name: 'provider_sync',
    input: z.strictObject({
      provider: z
        .enum(PROVIDERS)
        .optional()
        .describe('One provider; every provider when left out (home_read lists them)'),
    }),
    annotations: { ...WRITES, idempotentHint: true, openWorldHint: true },
    run: async (context, input) => {
      const outcome = await sendAndWait(context, [
        {
          device_id: null,
          capability: 'hub:discover',
          value: { provider: input.provider ?? null },
        },
      ]);
      return { structured: reported(context, outcome) };
    },
  }),
];
