import { z } from 'zod';
import { PRINTER_IDENTIFY_HOW, PRINTER_PRINT_OPTIONS, PRINTER_SOURCE } from './printer';

export const PRINTER_SETTINGS_PATCH = z.strictObject({
  idleSeconds: z.int().min(5).max(600).optional(),
  activeSeconds: z.int().min(1).max(60).optional(),
  leaseSeconds: z.int().min(60).max(86_400).optional(),
  lowThresholds: z.record(z.string(), z.int().min(1).max(50)).optional(),
  prices: z
    .record(z.string(), z.strictObject({ price: z.number().min(0), yieldPages: z.int().min(1) }))
    .optional(),
  currency: z.string().min(1).max(8).optional(),
  weeklyBudget: z.int().min(1).max(100_000).optional(),
  monthlyCap: z.number().min(0).nullable().optional(),
  printLessTarget: z.int().min(0).nullable().optional(),
  notify: z
    .strictObject({
      low: z.boolean().optional(),
      empty: z.boolean().optional(),
      problem: z.boolean().optional(),
      offline: z.boolean().optional(),
    })
    .optional(),
});

export type PrinterSettingsPatch = z.infer<typeof PRINTER_SETTINGS_PATCH>;

export const PRINTER_PREFS_PATCH = z.strictObject({
  sides: z.enum(['one-sided', 'two-sided-long-edge', 'two-sided-short-edge']).optional(),
  colorMode: z.string().min(1).optional(),
  quality: z.enum(['draft', 'normal', 'high']).optional(),
  media: z.string().min(1).optional(),
  copies: z.int().min(1).max(999).optional(),
  notifyJobDone: z.boolean().optional(),
});

export type PrinterPrefsPatch = z.infer<typeof PRINTER_PREFS_PATCH>;

const TARGET = { printer: z.string().min(1).optional() } as const;

export const PRINTER_ACTION_INPUT = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('print'),
    ...TARGET,
    source: PRINTER_SOURCE,
    name: z.string().min(1).max(120).optional(),
    options: PRINTER_PRINT_OPTIONS.optional(),
  }),
  z.strictObject({ action: z.literal('test_page'), ...TARGET }),
  z.strictObject({ action: z.literal('cancel'), ...TARGET, job: z.string().min(1) }),
  z.strictObject({ action: z.literal('cancel_all'), ...TARGET }),
  z.strictObject({ action: z.literal('hold'), ...TARGET, job: z.string().min(1) }),
  z.strictObject({ action: z.literal('release'), ...TARGET, job: z.string().min(1) }),
  z.strictObject({
    action: z.literal('identify'),
    ...TARGET,
    how: z.enum(PRINTER_IDENTIFY_HOW).optional(),
  }),
  z.strictObject({ action: z.literal('pause'), ...TARGET }),
  z.strictObject({ action: z.literal('resume'), ...TARGET }),
  z.strictObject({ action: z.literal('open_page'), ...TARGET }),
  z.strictObject({
    action: z.literal('add'),
    uri: z.string().min(1).max(500),
    name: z.string().min(1).max(80).optional(),
    room: z.string().min(1).max(80).optional(),
    user: z.string().min(1).max(120).optional(),
    password: z.string().min(1).max(200).optional(),
    fingerprint: z.string().min(1).max(200).optional(),
  }),
  z.strictObject({ action: z.literal('rescan') }),
  z.strictObject({
    action: z.literal('trust_certificate'),
    ...TARGET,
    fingerprint: z.string().min(1).max(200),
  }),
  z.strictObject({
    action: z.literal('credentials'),
    ...TARGET,
    user: z.string().min(1).max(120),
    password: z.string().min(1).max(200),
  }),
  z.strictObject({ action: z.literal('clear_history'), ...TARGET }),
  z.strictObject({ action: z.literal('forget'), ...TARGET }),
  z.strictObject({
    action: z.literal('configure'),
    ...TARGET,
    settings: PRINTER_SETTINGS_PATCH.optional(),
    prefs: PRINTER_PREFS_PATCH.optional(),
  }),
]);

export type PrinterActionInput = z.infer<typeof PRINTER_ACTION_INPUT>;

export const PRINTER_ACTION_NAMES = [
  'print',
  'test_page',
  'cancel',
  'cancel_all',
  'hold',
  'release',
  'identify',
  'pause',
  'resume',
  'open_page',
  'add',
  'rescan',
  'trust_certificate',
  'credentials',
  'clear_history',
  'forget',
  'configure',
] as const;

export type PrinterActionName = (typeof PRINTER_ACTION_NAMES)[number];

export const PRINTER_ACTION_TOOL_INPUT = z
  .strictObject({
    action: z.enum(PRINTER_ACTION_NAMES),
    ...TARGET,
    source: PRINTER_SOURCE.optional(),
    name: z.string().min(1).max(120).optional(),
    options: PRINTER_PRINT_OPTIONS.optional(),
    job: z.string().min(1).optional(),
    how: z.enum(PRINTER_IDENTIFY_HOW).optional(),
    uri: z.string().min(1).max(500).optional(),
    room: z.string().min(1).max(80).optional(),
    user: z.string().min(1).max(120).optional(),
    password: z.string().min(1).max(200).optional(),
    fingerprint: z.string().min(1).max(200).optional(),
    settings: PRINTER_SETTINGS_PATCH.optional(),
    prefs: PRINTER_PREFS_PATCH.optional(),
  })
  .transform((value, ctx): PrinterActionInput => {
    const parsed = PRINTER_ACTION_INPUT.safeParse(value);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues) {
      ctx.issues.push({ code: 'custom', message: issue.message, path: issue.path, input: value });
    }
    return z.NEVER;
  });
