import { z } from 'zod';
import { PRINTER_ACTION_NAMES } from './printer-actions';

export * from './printer-actions';
import { PRINTER_JOB, PRINTER_PRINT_OPTIONS } from './printer';
import { PRINTER_STATS } from './printer-stats';
import { PRINTER_SUPPLY_KINDS, PRINTER_SUPPLY_SLOT } from './printer-supplies';

export const PRINTER_STANDING = z.enum(['ok', 'low', 'out', 'unknown']);

export const PRINTER_SUPPLY_VIEW = z.strictObject({
  key: z.string(),
  slot: PRINTER_SUPPLY_SLOT,
  name: z.string(),
  colour: z.string(),
  kind: z.enum(PRINTER_SUPPLY_KINDS),
  consumed: z.boolean(),
  level: z.number().nullable(),
  partial: z.boolean(),
  standing: PRINTER_STANDING,
  threshold: z.number(),
  daysLeft: z.number().nullable(),
  percentPerDay: z.number().nullable(),
  percentPer100Pages: z.number().nullable(),
  emptyAt: z.iso.datetime({ offset: true }).nullable(),
  price: z.strictObject({ price: z.number(), yieldPages: z.number() }).nullable(),
});

export type PrinterSupplyView = z.infer<typeof PRINTER_SUPPLY_VIEW>;

export const PRINTER_SUPPLY_MARK = z.strictObject({
  key: z.string(),
  at: z.iso.datetime({ offset: true }),
  kind: z.enum(['replaced', 'low', 'empty']),
  certain: z.boolean(),
});

export const PRINTER_SUPPLY_POINT = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  level: z.number(),
});

export const PRINTER_SUPPLY_LINE = z.strictObject({
  key: z.string(),
  points: z.array(PRINTER_SUPPLY_POINT),
  forecast: z.array(PRINTER_SUPPLY_POINT),
});

export const PRINTER_TRAY_VIEW = z.strictObject({
  number: z.number().int(),
  name: z.string(),
  level: z.number().nullable(),
  partial: z.boolean(),
  capacity: z.number().nullable(),
  media: z.string().nullable(),
  mediaType: z.string().nullable(),
  ok: z.boolean(),
});

export const PRINTER_REF = z.strictObject({
  ref: z.string(),
  name: z.string(),
  online: z.boolean(),
});

export const PRINTER_TODAY = z.strictObject({
  pagesToday: z.number(),
  pagesWeek: z.number(),
  jobsToday: z.number(),
  color: z.number(),
  mono: z.number(),
  weeklyBudget: z.number(),
  lifetimePages: z.number().nullable(),
});

export const PRINTER_OVERVIEW = z.strictObject({
  printer: PRINTER_REF,
  state: z.enum(['idle', 'printing', 'stopped']),
  queue: z.enum(['running', 'paused']),
  power: z.enum(['awake', 'standby', 'hibernate', 'off']),
  summary: z.string(),
  tone: z.enum(['ok', 'busy', 'warn', 'error', 'asleep', 'paused']),
  queued: z.number(),
  supplies: z.array(PRINTER_SUPPLY_VIEW),
  trays: z.array(PRINTER_TRAY_VIEW),
  bins: z.array(PRINTER_TRAY_VIEW),
  today: PRINTER_TODAY,
  daysLeft: z.number().nullable(),
  actions: z.array(z.enum(PRINTER_ACTION_NAMES)),
});

export type PrinterOverview = z.infer<typeof PRINTER_OVERVIEW>;

export const PRINTER_SUPPLIES_VIEW = z.strictObject({
  printer: PRINTER_REF,
  period: z.enum(['day', 'week', 'month', 'year']),
  supplies: z.array(PRINTER_SUPPLY_VIEW),
  lines: z.array(PRINTER_SUPPLY_LINE),
  marks: z.array(PRINTER_SUPPLY_MARK),
  gaps: z.array(
    z.strictObject({
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
    }),
  ),
});

export const PRINTER_TRAYS_VIEW = z.strictObject({
  printer: PRINTER_REF,
  trays: z.array(PRINTER_TRAY_VIEW),
  bins: z.array(PRINTER_TRAY_VIEW),
  mediaReady: z.array(z.string()),
});

export const PRINTER_QUEUE_VIEW = z.strictObject({
  printer: PRINTER_REF,
  active: PRINTER_JOB.nullable(),
  waiting: z.array(PRINTER_JOB),
  others: z.number().int().nonnegative(),
  last: PRINTER_JOB.nullable(),
});

export type PrinterQueue = z.infer<typeof PRINTER_QUEUE_VIEW>;

export const PRINTER_JOBS_VIEW = z.strictObject({
  printer: PRINTER_REF,
  jobs: z.array(PRINTER_JOB),
  total: z.number().int().nonnegative(),
  gaps: z.array(
    z.strictObject({
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
      atLeastPages: z.number().nullable(),
    }),
  ),
});

export const PRINTER_STATS_VIEW = z.strictObject({
  printer: PRINTER_REF,
  stats: PRINTER_STATS,
  unit: z.string(),
  colour: z.boolean(),
  budget: z.strictObject({
    weekly: z.number(),
    monthlyCap: z.number().nullable(),
    target: z.number().nullable(),
  }),
  cost: z
    .strictObject({
      perMonoPage: z.number().nullable(),
      perColourPage: z.number().nullable(),
      month: z.number().nullable(),
      currency: z.string(),
      months: z.array(z.strictObject({ month: z.string(), amount: z.number() })),
    })
    .nullable(),
  people: z.array(z.strictObject({ label: z.string(), jobs: z.number(), mine: z.boolean() })),
  bests: z.strictObject({
    biggestJob: z.number().nullable(),
    longestSeconds: z.number().nullable(),
  }),
  states: z.strictObject({
    shares: z.array(z.strictObject({ state: z.string(), seconds: z.number() })),
    lane: z.array(
      z.strictObject({
        state: z.enum(['idle', 'printing', 'stopped', 'asleep', 'offline']),
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
      }),
    ),
  }),
  events: z.array(
    z.strictObject({
      at: z.iso.datetime({ offset: true }),
      kind: z.string(),
      text: z.string(),
    }),
  ),
});

export type PrinterStatsView = z.infer<typeof PRINTER_STATS_VIEW>;

export const PRINTER_OPTIONS_VIEW = z.strictObject({
  printer: PRINTER_REF,
  actions: z.array(z.enum(PRINTER_ACTION_NAMES)),
  formats: z.array(z.string()),
  accepts: z.array(z.string()),
  copies: z.strictObject({ lower: z.number(), upper: z.number() }).nullable(),
  sides: z.array(z.string()),
  colorModes: z.array(z.string()),
  qualities: z.array(z.string()),
  media: z.array(z.string()),
  mediaReady: z.array(z.string()),
  mediaSources: z.array(z.string()),
  mediaTypes: z.array(z.string()),
  orientations: z.array(z.string()),
  scalings: z.array(z.string()),
  outputBins: z.array(z.string()),
  contentOptimize: z.array(z.string()),
  resolutions: z.array(z.number()),
  finishings: z.array(z.number()),
  numberUp: z.array(z.number()),
  priorities: z.strictObject({ lower: z.number(), upper: z.number() }).nullable(),
  holdUntil: z.array(z.string()),
  pageRanges: z.boolean(),
  defaults: PRINTER_PRINT_OPTIONS,
  prefs: z.strictObject({
    sides: z.string().nullable(),
    colorMode: z.string().nullable(),
    quality: z.string().nullable(),
    media: z.string().nullable(),
    copies: z.number().nullable(),
    notifyJobDone: z.boolean(),
  }),
});

export type PrinterOptions = z.infer<typeof PRINTER_OPTIONS_VIEW>;

export const PRINTER_CANDIDATE = z.strictObject({
  uri: z.string(),
  name: z.string(),
  model: z.string().nullable(),
  location: z.string().nullable(),
  secure: z.boolean(),
  authentication: z.boolean(),
  known: z.boolean(),
});

export const PRINTER_CANDIDATES_VIEW = z.strictObject({
  searching: z.boolean(),
  candidates: z.array(PRINTER_CANDIDATE),
  printers: z.array(PRINTER_REF),
});

export const PRINTER_SETTINGS_VIEW = z.strictObject({
  printer: PRINTER_REF,
  uri: z.string(),
  secure: z.boolean(),
  fingerprint: z.string().nullable(),
  pushing: z.boolean(),
  idleSeconds: z.number(),
  activeSeconds: z.number(),
  leaseSeconds: z.number(),
  lowThresholds: z.record(z.string(), z.number()),
  prices: z.record(z.string(), z.strictObject({ price: z.number(), yieldPages: z.number() })),
  currency: z.string(),
  weeklyBudget: z.number(),
  monthlyCap: z.number().nullable(),
  printLessTarget: z.number().nullable(),
  notify: z.strictObject({
    low: z.boolean(),
    empty: z.boolean(),
    problem: z.boolean(),
    offline: z.boolean(),
  }),
  hasCredentials: z.boolean(),
  needsAuth: z.boolean(),
  certificateChange: z.strictObject({ previous: z.string(), presented: z.string() }).nullable(),
});

export type PrinterSettingsView = z.infer<typeof PRINTER_SETTINGS_VIEW>;
