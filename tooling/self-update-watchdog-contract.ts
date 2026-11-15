import { z } from 'zod';

const PATH = z.string().startsWith('/');

export const WATCHDOG_ORDERS = ['watch', 'recover', 'rollback', 'keep'] as const;

export type WatchdogOrder = (typeof WATCHDOG_ORDERS)[number];

export const WATCHDOG_OPTIONS = z.strictObject({
  runId: z.uuid(),
  url: z.url({ protocol: /^https?$/u }),
  service: PATH,
  install: PATH,
  database: PATH,
  backup: PATH,
  buildIdentity: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .optional(),
  ledger: PATH,
  health: PATH,
  data: PATH,
  startingSchema: z.int().nonnegative().nullable(),
  order: z.enum(WATCHDOG_ORDERS),
  holdSeconds: z.int().min(0).max(600),
  expectedSchema: z.int().nonnegative().nullable(),
});

export type WatchdogOptions = z.infer<typeof WATCHDOG_OPTIONS>;
