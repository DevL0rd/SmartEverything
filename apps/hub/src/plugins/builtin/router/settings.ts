import { z } from 'zod';

const HOST = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9.:-]+$/, 'a host name or IP address');

function blankable<T extends z.ZodType<string>>(schema: T): z.ZodType<z.output<T> | null> {
  return z
    .union([z.literal(''), schema])
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value));
}

export const ROUTER_SETTINGS = z.object({
  host: blankable(HOST),
  user: z.string().trim().min(1).default('admin'),
  remote_script: z.string().trim().min(1).default('/jffs/lrm-collect.sh'),
  ping_target: HOST.default('8.8.8.8'),
  paused: z.boolean().default(false),
});

export type RouterSettings = z.output<typeof ROUTER_SETTINGS>;

export const ROUTER_SETTINGS_FORM = {
  host: {
    type: 'string',
    title: 'Router address',
    description: 'The IP address of your ASUS router running Asuswrt-Merlin.',
  },
  user: { type: 'string', title: 'SSH user', default: 'admin' },
  remote_script: {
    type: 'string',
    title: 'Collector script on the router',
    default: '/jffs/lrm-collect.sh',
  },
  ping_target: {
    type: 'string',
    title: 'Latency target',
    description: 'The address the router pings to measure internet latency.',
    default: '8.8.8.8',
  },
  paused: {
    type: 'boolean',
    title: 'Pause monitoring',
    description: 'Stops all traffic to the router until you turn it back on.',
  },
} as const;
