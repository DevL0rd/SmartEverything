import { z } from 'zod';
import { IMPORT_FAILURES } from './errors';
import type { ImportSource } from './scopes';

export const IMPORT_STATES = [
  'awaiting_consent',
  'running',
  'finished',
  'cancelled',
  'interrupted',
  'failed',
] as const;

export type ImportState = (typeof IMPORT_STATES)[number];

const COUNT = z.int().nonnegative();

export const IMPORT_COUNTS = z
  .strictObject({
    listed: COUNT,
    copied: COUNT,
    duplicates: COUNT,
    skipped: COUNT,
    failed: COUNT,
    bytes: COUNT,
  })
  .readonly();

export type ImportCounts = z.infer<typeof IMPORT_COUNTS>;

export const NO_COUNTS: ImportCounts = {
  listed: 0,
  copied: 0,
  duplicates: 0,
  skipped: 0,
  failed: 0,
  bytes: 0,
};

export const IMPORT_SELECTION = z
  .strictObject({ drive: z.boolean(), photos: z.boolean() })
  .readonly();

export type ImportSelection = z.infer<typeof IMPORT_SELECTION>;

export const IMPORT_RECORD = z
  .strictObject({
    id: z.uuid(),
    profileId: z.uuid(),
    selection: IMPORT_SELECTION,
    state: z.enum(IMPORT_STATES),
    failure: z.enum(IMPORT_FAILURES).nullable(),
    driveCursor: z.string().min(1).nullable(),
    drive: IMPORT_COUNTS,
    photos: IMPORT_COUNTS,
    startedAt: z.iso.datetime({ offset: true }),
    finishedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .readonly();

export type ImportRecord = z.infer<typeof IMPORT_RECORD>;

export type ImportPatch = Partial<
  Omit<ImportRecord, 'id' | 'profileId' | 'selection' | 'startedAt'>
>;

export interface ImportLedger {
  insert(record: ImportRecord): void;
  update(id: string, patch: ImportPatch): ImportRecord;
  find(id: string): ImportRecord | undefined;
  latestOf(profileId: string): ImportRecord | undefined;
  unfinished(): readonly ImportRecord[];
  markDone(id: string, source: ImportSource, remoteId: string): void;
  isDone(id: string, source: ImportSource, remoteId: string): boolean;
}
