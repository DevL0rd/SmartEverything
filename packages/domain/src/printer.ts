import { z } from 'zod';
import { PRINTER_SUPPLY_KINDS, PRINTER_SUPPLY_SLOT } from './printer-supplies';

export * from './printer-error';

export const PRINTER_PLUGIN_ID = 'printer';

export const PRINTER_KEYS = {
  state: 'raw:printer.state',
  queue: 'raw:printer.queue',
  accepting: 'raw:printer.accepting',
  queuedJobs: 'raw:printer.queued_jobs',
  problem: 'raw:printer.problem',
  attention: 'raw:printer.attention',
  powerState: 'raw:printer.power_state',
  jobProgress: 'raw:printer.job_progress',
  pagesTotal: 'raw:printer.pages_total',
  pagesColor: 'raw:printer.pages_color',
  pagesMono: 'raw:printer.pages_mono',
  pagesToday: 'raw:printer.pages_today',
  pagesWeek: 'raw:printer.pages_week',
  daysLeft: 'raw:printer.days_left',
  costMonth: 'raw:printer.cost_month',
  testPage: 'raw:printer.test_page',
  identify: 'raw:printer.identify',
} as const;

export const PRINTER_SUPPLY_PREFIX = 'raw:printer.supply.';

export function printerTrayKey(number: number): `raw:printer.tray.${string}` {
  return `raw:printer.tray.${String(number)}`;
}

export function printerTrayMediaKey(number: number): `raw:printer.tray.${string}` {
  return `raw:printer.tray.${String(number)}.media`;
}

export function printerBinKey(number: number): `raw:printer.bin.${string}` {
  return `raw:printer.bin.${String(number)}`;
}

export const PRINTER_VARIANTS = ['inkjet', 'tank', 'laser', 'label', 'receipt', 'photo'] as const;

export type PrinterVariant = (typeof PRINTER_VARIANTS)[number];

export const PRINTER_SECTIONS = ['stats', 'supplies', 'paper', 'print', 'jobs', 'details'] as const;

export const PRINTER_IDENTIFY_HOW = ['flash', 'sound', 'display', 'speak'] as const;

export const PRINTER_PROBLEM_DETAIL = z.strictObject({
  keyword: z.string().min(1),
  severity: z.enum(['warning', 'error']),
  part: z.enum([
    'cover',
    'input-tray',
    'cartridge',
    'path',
    'input-path',
    'output-path',
    'output',
    'waste',
    'none',
  ]),
});

export type PrinterProblemDetail = z.infer<typeof PRINTER_PROBLEM_DETAIL>;

export const PRINTER_SUPPLY_DETAIL = z.strictObject({
  key: z.string().min(1),
  slot: PRINTER_SUPPLY_SLOT,
  name: z.string(),
  colour: z.string().regex(/^#[0-9a-f]{6}$/u),
  kind: z.enum(PRINTER_SUPPLY_KINDS),
  consumed: z.boolean(),
  lowLevel: z.number().nullable(),
  standing: z.enum(['ok', 'low', 'out', 'unknown']),
  threshold: z.number(),
  daysLeft: z.number().nullable(),
});

export type PrinterSupplyDetail = z.infer<typeof PRINTER_SUPPLY_DETAIL>;

export const PRINTER_TRAY_DETAIL = z.strictObject({
  number: z.number().int().positive(),
  name: z.string(),
  capacity: z.number().nullable(),
});

export const PRINTER_ALERT_DETAIL = z.strictObject({
  code: z.string(),
  severity: z.enum(['critical', 'warning', 'report']),
  group: z.string().nullable(),
  description: z.string().nullable(),
});

export const PRINTER_ACTIVE_JOB = z.strictObject({
  pages: z.number().nullable(),
  pagesDone: z.number().nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  state: z.enum(['processing', 'stopped', 'held']),
});

export type PrinterActiveJob = z.infer<typeof PRINTER_ACTIVE_JOB>;

export const PRINTER_FEATURES = z.strictObject({
  subscriptions: z.boolean(),
  identify: z.boolean(),
  pause: z.boolean(),
  hold: z.boolean(),
  cancelAll: z.boolean(),
  validate: z.boolean(),
  cancelJob: z.boolean(),
});

export type PrinterFeatures = z.infer<typeof PRINTER_FEATURES>;

export const PRINTER_DETAILS = z.object({
  pluginId: z.literal(PRINTER_PLUGIN_ID),
  uuid: z.string(),
  variant: z.enum(PRINTER_VARIANTS),
  mfp: z.boolean(),
  colour: z.boolean(),
  duplex: z.boolean(),
  ppm: z.number().nullable(),
  ppmColour: z.number().nullable(),
  formats: z.array(z.string()),
  security: z.enum(['ipp', 'ipps']),
  pinned: z.boolean(),
  uri: z.string(),
  adminUrl: z.string().nullable(),
  iconUrl: z.string().nullable(),
  location: z.string().nullable(),
  serial: z.string().nullable(),
  firmware: z.string().nullable(),
  versions: z.array(z.string()),
  authentication: z.array(z.string()),
  resolutions: z.array(z.number()),
  features: PRINTER_FEATURES,
  reportsSupplies: z.boolean(),
  reportsCounters: z.boolean(),
  supplies: z.array(PRINTER_SUPPLY_DETAIL),
  trays: z.array(PRINTER_TRAY_DETAIL),
  bins: z.array(PRINTER_TRAY_DETAIL),
  stateMessage: z.string().nullable(),
  operatorMessage: z.string().nullable(),
  problems: z.array(PRINTER_PROBLEM_DETAIL),
  alerts: z.array(PRINTER_ALERT_DETAIL),
  activeJob: PRINTER_ACTIVE_JOB.nullable(),
  lastSeen: z.iso.datetime({ offset: true }).nullable(),
  gapOpen: z.boolean(),
  wifiSsid: z.string().nullable(),
  uptimeSeconds: z.number().nullable(),
});

export type PrinterDetails = z.infer<typeof PRINTER_DETAILS>;

export const PRINTER_JOB_STATES = [
  'pending',
  'held',
  'processing',
  'stopped',
  'canceled',
  'aborted',
  'completed',
] as const;

export const PRINTER_JOB = z.strictObject({
  key: z.string().min(1),
  jobId: z.number().int().nullable(),
  state: z.enum(PRINTER_JOB_STATES),
  mine: z.boolean(),
  origin: z.enum(['hub', 'observed']),
  name: z.string().nullable(),
  person: z.string().nullable(),
  pages: z.number().nullable(),
  pagesDone: z.number().nullable(),
  sheets: z.number().nullable(),
  color: z.number().nullable(),
  mono: z.number().nullable(),
  duplex: z.boolean().nullable(),
  copies: z.number().nullable(),
  format: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }).nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  reasons: z.array(z.string()),
  cause: z.string().nullable(),
  message: z.string().nullable(),
  ahead: z.number().nullable(),
  progress: z.number().min(0).max(100).nullable(),
});

export type PrinterJob = z.infer<typeof PRINTER_JOB>;

export const PRINTER_PRINT_OPTIONS = z.strictObject({
  copies: z.int().min(1).max(999).optional(),
  sides: z.enum(['one-sided', 'two-sided-long-edge', 'two-sided-short-edge']).optional(),
  colorMode: z.string().min(1).optional(),
  quality: z.enum(['draft', 'normal', 'high']).optional(),
  media: z.string().min(1).optional(),
  mediaSource: z.string().min(1).optional(),
  mediaType: z.string().min(1).optional(),
  orientation: z.enum(['portrait', 'landscape', 'reverseLandscape', 'reversePortrait']).optional(),
  pageRanges: z.string().min(1).optional(),
  numberUp: z.int().min(1).max(16).optional(),
  scaling: z.string().min(1).optional(),
  outputBin: z.string().min(1).optional(),
  resolution: z.int().min(72).max(4800).optional(),
  contentOptimize: z.string().min(1).optional(),
  priority: z.int().min(1).max(100).optional(),
  holdUntil: z.string().min(1).optional(),
  finishings: z.array(z.int().min(3)).optional(),
});

export type PrinterPrintOptions = z.infer<typeof PRINTER_PRINT_OPTIONS>;

export const PRINTER_SOURCE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('upload'), uploadId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('attachment'), name: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('machine'),
    machine: z.string().min(1),
    path: z.string().min(1),
  }),
]);

export type PrinterSource = z.infer<typeof PRINTER_SOURCE>;

export const PRINTER_VIEW_NAMES = [
  'overview',
  'supplies',
  'trays',
  'queue',
  'jobs',
  'stats',
  'options',
  'candidates',
  'settings',
] as const;

export const PRINTER_STATS_METRICS = [
  'totals',
  'pages',
  'state_time',
  'reliability',
  'cost',
  'heatmap',
  'bests',
  'streaks',
] as const;

export const PRINTER_READ_INPUT = z.strictObject({
  view: z.enum(PRINTER_VIEW_NAMES),
  printer: z.string().min(1).optional(),
  state: z.enum(['active', 'waiting', 'completed', 'canceled', 'aborted', 'all']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  person: z.string().min(1).optional(),
  limit: z.int().min(1).max(200).optional(),
  metric: z.enum(PRINTER_STATS_METRICS).optional(),
  period: z.enum(['day', 'week', 'month', 'year']).optional(),
  anchor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .optional(),
  compare: z.boolean().optional(),
});

export type PrinterReadInput = z.infer<typeof PRINTER_READ_INPUT>;
