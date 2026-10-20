import { z } from 'zod';
import { PRINTER_JOB_STATES } from '@smarteverything/domain';
import type { PluginRecords } from '../contract';
import {
  PRINTER_PREFS,
  PRINTER_SETTINGS,
  defaultPrefs,
  defaultSettings,
  type PrinterPrefs,
} from './settings';
import { WATCH_STATE, emptyWatch } from './watch-state';

const ISO = z.iso.datetime({ offset: true });

export const PRINTER_RECORD = z.strictObject({
  uuid: z.string().min(1),
  uri: z.string().min(1),
  name: z.string().min(1),
  customName: z.string().nullable().default(null),
  room: z.string().nullable().default(null),
  pin: z.string().nullable().default(null),
  adminUrl: z.string().nullable().default(null),
  user: z.string().nullable().default(null),
  slotKeys: z.array(z.string()).default([]),
  disabledOps: z.array(z.int()).default([]),
  firstDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  lastSeen: ISO.nullable().default(null),
  lastUpTime: z.number().nullable().default(null),
  epoch: z.int().default(0),
  counters: z
    .strictObject({
      pages: z.number().nullable(),
      color: z.number().nullable(),
      mono: z.number().nullable(),
    })
    .nullable()
    .default(null),
  configChange: z.number().nullable().default(null),
  markerChange: z.number().nullable().default(null),
  subscription: z
    .strictObject({ id: z.int(), sequence: z.int().nullable() })
    .nullable()
    .default(null),
  watch: WATCH_STATE.default(emptyWatch()),
  settings: PRINTER_SETTINGS.default(defaultSettings()),
  prefs: z.record(z.string(), PRINTER_PREFS).default({}),
  needsAuth: z.boolean().default(false),
  certificateChange: z
    .strictObject({ previous: z.string(), presented: z.string() })
    .nullable()
    .default(null),
});

export type PrinterRecord = z.infer<typeof PRINTER_RECORD>;

export const JOB_RECORD = z.strictObject({
  key: z.string(),
  jobId: z.int().nullable(),
  epoch: z.int(),
  origin: z.enum(['hub', 'observed']),
  person: z.string().nullable(),
  name: z.string().nullable(),
  state: z.enum(PRINTER_JOB_STATES),
  reasons: z.array(z.string()).default([]),
  printerReasons: z.array(z.string()).default([]),
  message: z.string().nullable().default(null),
  format: z.string().nullable().default(null),
  copies: z.number().nullable().default(null),
  colorMode: z.string().nullable().default(null),
  sides: z.string().nullable().default(null),
  pages: z.number().nullable(),
  sheets: z.number().nullable().default(null),
  color: z.number().nullable().default(null),
  mono: z.number().nullable().default(null),
  kOctets: z.number().nullable().default(null),
  createdAt: ISO.nullable(),
  startedAt: ISO.nullable().default(null),
  completedAt: ISO.nullable().default(null),
  counted: z.boolean().default(false),
});

export type JobRecord = z.infer<typeof JOB_RECORD>;

export const SUPPLY_DAY = z.record(
  z.string(),
  z.strictObject({ close: z.number(), min: z.number(), max: z.number(), samples: z.int() }),
);

export type SupplyDayRecord = z.infer<typeof SUPPLY_DAY>;

export const MARK_RECORD = z.strictObject({
  key: z.string(),
  at: ISO,
  kind: z.enum(['replaced', 'low', 'empty']),
  before: z.number().nullable(),
  after: z.number().nullable(),
  pages: z.number().nullable(),
  certain: z.boolean(),
});

export type MarkRecord = z.infer<typeof MARK_RECORD>;

export const EVENT_RECORD = z.strictObject({
  at: ISO,
  kind: z.string(),
  text: z.string(),
});

export type EventRecord = z.infer<typeof EVENT_RECORD>;

export const STATE_SPAN = z.strictObject({
  state: z.enum(['idle', 'printing', 'stopped', 'asleep', 'offline']),
  from: ISO,
  to: ISO.nullable(),
});

export type StateSpan = z.infer<typeof STATE_SPAN>;

export const PRINTERS = 'printers';

export function jobsCollection(uuid: string): string {
  return `jobs.${uuid}`;
}

export function daysCollection(uuid: string): string {
  return `days.${uuid}`;
}

export function supplyDaysCollection(uuid: string): string {
  return `supply-days.${uuid}`;
}

export function marksCollection(uuid: string): string {
  return `marks.${uuid}`;
}

export function eventsCollection(uuid: string): string {
  return `events.${uuid}`;
}

export function spansCollection(uuid: string): string {
  return `spans.${uuid}`;
}

export function readRecords<T>(
  records: PluginRecords,
  schema: z.ZodType<T>,
  invalid: (key: string) => void = () => undefined,
): readonly T[] {
  return records.list().flatMap((entry) => {
    const parsed = schema.safeParse(entry.value);
    if (!parsed.success) invalid(entry.key);
    return parsed.success ? [parsed.data] : [];
  });
}

export function adminUrlOf(record: PrinterRecord, moreInfo: string | null): string | null {
  return record.adminUrl ?? moreInfo;
}

export function prefsOf(record: PrinterRecord, profileId: string): PrinterPrefs {
  return record.prefs[profileId] ?? defaultPrefs();
}
