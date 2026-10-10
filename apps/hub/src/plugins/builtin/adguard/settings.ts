import { z } from 'zod';

export const PASSWORD_SECRET = 'password';

export const ADGUARD_SETTINGS = z.object({
  url: z
    .union([z.literal(''), z.url({ protocol: /^https?$/ })])
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
  user: z
    .string()
    .trim()
    .nullable()
    .default(null)
    .transform((value) => (value === null || value.length === 0 ? null : value)),
  paused: z.boolean().default(false),
});

export type AdGuardSettings = z.output<typeof ADGUARD_SETTINGS>;

export const ADGUARD_SETTINGS_FORM = {
  url: {
    type: 'string',
    title: 'AdGuard Home address',
    description: 'For example http://192.168.1.1:3000',
  },
  user: { type: 'string', title: 'User name' },
  [PASSWORD_SECRET]: { type: 'string', title: 'Password', secret: true },
  paused: {
    type: 'boolean',
    title: 'Pause monitoring',
    description: 'Stops all traffic to AdGuard Home until you turn it back on.',
  },
} as const;
