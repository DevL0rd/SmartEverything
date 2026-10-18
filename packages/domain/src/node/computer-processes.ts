import { z } from 'zod';

export const PROCESS_SORTS = [
  'cpu',
  'memory',
  'disk',
  'gpu',
  'name',
  'threads',
  'user',
  'pid',
] as const;

export type ProcessSort = (typeof PROCESS_SORTS)[number];

export const PROCESS_ORDERS = ['ascending', 'descending'] as const;

export const PROCESS_SIGNALS = ['end', 'force', 'stop', 'continue'] as const;

export type ProcessSignal = (typeof PROCESS_SIGNALS)[number];

export const PROCESS_STATES = ['running', 'sleeping', 'stopped', 'zombie', 'other'] as const;

export const PROCESS_PAGE_SIZE = 50;

export const PROCESS_SEARCH = z.string().trim().min(1).max(80);

export const PROCESS_QUERY = z.strictObject({
  sort: z.enum(PROCESS_SORTS).default('cpu'),
  order: z.enum(PROCESS_ORDERS).optional(),
  search: PROCESS_SEARCH.optional(),
  tree: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).default(PROCESS_PAGE_SIZE),
  cursor: z.coerce.number().int().min(0).default(0),
});

export type ProcessQuery = z.infer<typeof PROCESS_QUERY>;

export const PROCESS_WINDOW = z.strictObject({
  sort: z.enum(PROCESS_SORTS),
  order: z.enum(PROCESS_ORDERS),
  search: PROCESS_SEARCH.optional(),
  tree: z.boolean(),
  gpu: z.boolean(),
  offset: z.int().nonnegative(),
  limit: z.int().positive(),
});

export type ProcessWindow = z.infer<typeof PROCESS_WINDOW>;

export const PROCESS_ROW = z.strictObject({
  pid: z.int().positive(),
  start: z.int().nonnegative(),
  ppid: z.int().nonnegative(),
  name: z.string().min(1),
  command: z.string(),
  user: z.string().min(1),
  state: z.enum(PROCESS_STATES),
  cpu: z.number().min(0),
  memoryBytes: z.number().nonnegative(),
  gpu: z.number().min(0).max(100).nullable(),
  diskRate: z.number().nonnegative(),
  threads: z.int().nonnegative(),
  descendants: z.int().nonnegative(),
  own: z.boolean(),
});

export type ProcessRow = z.infer<typeof PROCESS_ROW>;

export const PROCESS_STATIC_FIELDS = ['ppid', 'name', 'command', 'user'] as const;

export const PROCESS_ROW_UPDATE = PROCESS_ROW.partial({
  ppid: true,
  name: true,
  command: true,
  user: true,
});

export type ProcessRowUpdate = z.infer<typeof PROCESS_ROW_UPDATE>;

export function completeProcessRow(
  known: ProcessRow | undefined,
  update: ProcessRowUpdate,
): ProcessRow | null {
  const { ppid, name, command, user, ...changing } = update;
  const complete = {
    ...changing,
    ppid: ppid ?? known?.ppid,
    name: name ?? known?.name,
    command: command ?? known?.command,
    user: user ?? known?.user,
  };
  const parsed = PROCESS_ROW.safeParse(complete);
  return parsed.success ? parsed.data : null;
}

export function processKey(row: Pick<ProcessRow, 'pid' | 'start'>): string {
  return [row.pid, row.start].join(':');
}

export const PROCESS_LIST = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  total: z.int().nonnegative(),
  next: z.int().nonnegative().nullable(),
  processes: z.array(PROCESS_ROW),
});

export type ProcessList = z.infer<typeof PROCESS_LIST>;

export const PROCESSES_PART = z.strictObject({
  total: z.int().nonnegative(),
  offset: z.int().nonnegative(),
  order: z.array(z.string().min(1)),
  rows: z.array(PROCESS_ROW),
});

export type ProcessesPart = z.infer<typeof PROCESSES_PART>;

export const PROCESSES_UPDATE = z.strictObject({
  ...PROCESSES_PART.shape,
  rows: z.array(PROCESS_ROW_UPDATE),
});

export type ProcessesUpdate = z.infer<typeof PROCESSES_UPDATE>;

export function mergeProcessUpdates(
  older: ProcessesUpdate,
  newer: ProcessesUpdate,
): ProcessesUpdate {
  const before = new Map(older.rows.map((row) => [processKey(row), row] as const));
  const visible = new Set(newer.order);
  const changed = new Set(newer.rows.map(processKey));
  const carried = older.rows.filter((row) => {
    const key = processKey(row);
    return visible.has(key) && !changed.has(key);
  });
  const rows = newer.rows.map((row) => ({ ...before.get(processKey(row)), ...row }));
  return { ...newer, rows: [...carried, ...rows] };
}

export const PROCESS_DETAIL = z.strictObject({
  pid: z.int().positive(),
  name: z.string().min(1),
  command: z.string(),
  executable: z.string().nullable(),
  workingDirectory: z.string().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  ppid: z.int().nonnegative(),
  parentName: z.string().nullable(),
  children: z.array(z.strictObject({ pid: z.int().positive(), name: z.string().min(1) })),
  user: z.string().min(1),
  threads: z.int().nonnegative(),
  openFiles: z.int().nonnegative().nullable(),
  sockets: z.int().nonnegative().nullable(),
  niceness: z.int().min(-20).max(19).nullable(),
  cgroup: z.string().nullable(),
  own: z.boolean(),
});

export type ProcessDetail = z.infer<typeof PROCESS_DETAIL>;

export const PROCESS_PRIORITIES = ['normal', 'low', 'lowest'] as const;

export const PROCESS_NICE: Readonly<Record<(typeof PROCESS_PRIORITIES)[number], number>> = {
  normal: 0,
  low: 10,
  lowest: 19,
};
