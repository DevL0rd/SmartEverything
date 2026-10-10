import { z } from 'zod';

export const PROCESS_SORTS = ['cpu', 'memory', 'disk'] as const;

export type ProcessSort = (typeof PROCESS_SORTS)[number];

export const PROCESS_SIGNALS = ['end', 'force', 'stop', 'continue'] as const;

export type ProcessSignal = (typeof PROCESS_SIGNALS)[number];

export const PROCESS_STATES = ['running', 'sleeping', 'stopped', 'zombie', 'other'] as const;

export const PROCESS_LIMIT = 50;

export const PROCESS_QUERY = z.strictObject({
  sort: z.enum(PROCESS_SORTS).default('cpu'),
  search: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(PROCESS_LIMIT).default(PROCESS_LIMIT),
});

export type ProcessQuery = z.infer<typeof PROCESS_QUERY>;

export const PROCESS_ROW = z.strictObject({
  pid: z.int().positive(),
  name: z.string().min(1),
  command: z.string(),
  state: z.enum(PROCESS_STATES),
  cpu: z.number().min(0).max(100),
  memoryBytes: z.number().nonnegative(),
  diskRate: z.number().nonnegative(),
  threads: z.int().nonnegative(),
  own: z.boolean(),
});

export type ProcessRow = z.infer<typeof PROCESS_ROW>;

export const PROCESS_LIST = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  total: z.int().nonnegative(),
  processes: z.array(PROCESS_ROW),
});

export type ProcessList = z.infer<typeof PROCESS_LIST>;
