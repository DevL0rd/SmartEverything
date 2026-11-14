import { z } from 'zod';
import { DRIVE_DATA_SPACE } from './root';
import { SMART_RULE_ITEM_KINDS } from './smart-rule';

const ID = z.uuid();
const DAY = z.iso.date();
const COUNT = z.int().nonnegative();
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const DRIVE_HISTORY_MIN_MONTHS = 2;

function dayParts(day: string): readonly [number, number, number] {
  const [year = 0, month = 0, date = 0] = day.split('-').map(Number);
  return [year, month, date];
}

export function driveHistoryShown(firstDay: string, latestDay: string): boolean {
  const [firstYear, firstMonth, firstDate] = dayParts(firstDay);
  const [latestYear, latestMonth, latestDate] = dayParts(latestDay);
  const wholeMonths =
    (latestYear - firstYear) * 12 + (latestMonth - firstMonth) - (latestDate < firstDate ? 1 : 0);
  return wholeMonths >= DRIVE_HISTORY_MIN_MONTHS;
}

export const DRIVE_STATS_KIND = z
  .strictObject({
    kind: z.enum(SMART_RULE_ITEM_KINDS),
    items: COUNT,
    bytes: COUNT,
  })
  .readonly();

export const DRIVE_STATS_ROOT = z
  .strictObject({
    rootId: ID,
    items: COUNT,
    folders: COUNT,
    bytes: COUNT,
    kinds: z.array(DRIVE_STATS_KIND).readonly(),
  })
  .readonly();

export const DRIVE_STATS_DAY = z
  .strictObject({ day: DAY, items: COUNT, bytes: COUNT, added: COUNT, removed: COUNT })
  .readonly();

export const DRIVE_STATS_PURGE = z
  .strictObject({ month: MONTH, trashBytes: COUNT, versionBytes: COUNT })
  .readonly();

export const DRIVE_STATS = z
  .strictObject({
    items: COUNT,
    folders: COUNT,
    bytes: COUNT,
    liveBytes: COUNT,
    versionBytes: COUNT,
    trashBytes: COUNT,
    kinds: z.array(DRIVE_STATS_KIND).readonly(),
    roots: z.array(DRIVE_STATS_ROOT).readonly(),
    space: DRIVE_DATA_SPACE,
    fullInMonths: z.number().nonnegative().nullable(),
    purges: z.array(DRIVE_STATS_PURGE).readonly(),
    growth: z.array(DRIVE_STATS_DAY).readonly().nullable(),
  })
  .readonly();

export type DriveStats = z.infer<typeof DRIVE_STATS>;
