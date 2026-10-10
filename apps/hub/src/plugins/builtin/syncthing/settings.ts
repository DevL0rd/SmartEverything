import { z } from 'zod';

export const API_KEY_SECRET = 'api_key';

const SYNCTHING_URL = z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, ''));

export const SYNCTHING_SETTINGS = z.object({
  url: z
    .union([z.literal(''), SYNCTHING_URL])
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
  overdue_hours: z
    .number()
    .int()
    .min(0)
    .max(24 * 90)
    .default(72),
});

export type SyncthingSettings = z.output<typeof SYNCTHING_SETTINGS>;

export const SYNCTHING_SETTINGS_FORM = {
  url: {
    type: 'string',
    title: 'Syncthing address',
    description: 'Where the Syncthing web page opens, for example http://127.0.0.1:8384.',
  },
  api_key: { type: 'string', title: 'API key', secret: true },
  overdue_hours: {
    type: 'number',
    title: 'Warn when a device is away for',
    description: 'Hours a device can stay offline before it needs attention. 0 turns this off.',
    default: 72,
  },
} as const;
