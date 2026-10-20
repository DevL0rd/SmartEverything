import { z } from 'zod';
import { PRINTER_SETTINGS_PATCH, type PrinterSettingsPatch } from '@smarteverything/domain';

export const PRINTER_SETTINGS = z.strictObject({
  idleSeconds: z.int().min(5).max(600).default(30),
  activeSeconds: z.int().min(1).max(60).default(3),
  leaseSeconds: z.int().min(60).max(86_400).default(3600),
  lowThresholds: z.record(z.string(), z.int().min(1).max(50)).default({}),
  prices: z
    .record(z.string(), z.strictObject({ price: z.number().min(0), yieldPages: z.int().min(1) }))
    .default({}),
  currency: z.string().min(1).max(8).default('€'),
  weeklyBudget: z.int().min(1).max(100_000).default(100),
  monthlyCap: z.number().min(0).nullable().default(null),
  printLessTarget: z.int().min(0).nullable().default(null),
  notify: z
    .strictObject({
      low: z.boolean().default(true),
      empty: z.boolean().default(true),
      problem: z.boolean().default(true),
      offline: z.boolean().default(false),
    })
    .default({ low: true, empty: true, problem: true, offline: false }),
});

export type PrinterSettings = z.infer<typeof PRINTER_SETTINGS>;

export const PRINTER_PREFS = z.strictObject({
  sides: z
    .enum(['one-sided', 'two-sided-long-edge', 'two-sided-short-edge'])
    .nullable()
    .default(null),
  colorMode: z.string().nullable().default(null),
  quality: z.enum(['draft', 'normal', 'high']).nullable().default(null),
  media: z.string().nullable().default(null),
  copies: z.int().min(1).max(999).nullable().default(null),
  notifyJobDone: z.boolean().default(true),
});

export type PrinterPrefs = z.infer<typeof PRINTER_PREFS>;

export function defaultSettings(): PrinterSettings {
  return PRINTER_SETTINGS.parse({});
}

export function defaultPrefs(): PrinterPrefs {
  return PRINTER_PREFS.parse({});
}

function defined(source: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

export function mergeSettings(
  current: PrinterSettings,
  patch: PrinterSettingsPatch,
): PrinterSettings {
  const checked = PRINTER_SETTINGS_PATCH.parse(patch);
  return PRINTER_SETTINGS.parse({
    ...current,
    ...defined(checked),
    notify: { ...current.notify, ...defined(checked.notify ?? {}) },
    lowThresholds: checked.lowThresholds ?? current.lowThresholds,
    prices: checked.prices ?? current.prices,
  });
}

export function mergePrefs(current: PrinterPrefs, patch: object): PrinterPrefs {
  return PRINTER_PREFS.parse({ ...current, ...defined(patch) });
}
