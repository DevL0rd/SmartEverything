import { z } from 'zod';

const OPENRGB_DEFAULT_HOST = '127.0.0.1';
const OPENRGB_DEFAULT_PORT = 6742;
const MAX_PORT = 65_535;

export const OPENRGB_SETTINGS = z.object({
  host: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.:-]+$/, 'a host name or IP address')
    .default(OPENRGB_DEFAULT_HOST),
  port: z.number().int().min(1).max(MAX_PORT).default(OPENRGB_DEFAULT_PORT),
});

export type OpenRgbSettings = z.output<typeof OPENRGB_SETTINGS>;

export const OPENRGB_SETTINGS_FORM = {
  host: {
    type: 'string',
    title: 'OpenRGB server address',
    description:
      'Where the OpenRGB SDK server runs. Keep 127.0.0.1 for this computer; OpenRGB has no sign-in, so use another address only on a network you trust.',
    default: OPENRGB_DEFAULT_HOST,
  },
  port: {
    type: 'number',
    title: 'OpenRGB server port',
    minimum: 1,
    maximum: MAX_PORT,
    description: 'The SDK server port in OpenRGB (Start Server).',
    default: OPENRGB_DEFAULT_PORT,
  },
} as const;
