import {
  LOG_LEVEL,
  LOG_PLATFORM,
  LOG_RUNTIME,
  RUNTIME_LOG_ACK,
  RUNTIME_LOG_BATCH,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { LogFailure, StoredLogRecord } from '../store/repositories/runtime-log-types';

const FAILURE: z.ZodType<LogFailure> = z.lazy(() =>
  z.strictObject({
    name: z.string(),
    message: z.string(),
    stack: z.exactOptional(z.string()),
    cause: z.exactOptional(FAILURE),
  }),
);

const STORED_LOG_RECORD: z.ZodType<StoredLogRecord> = z.strictObject({
  at: z.string(),
  recordedAt: z.string(),
  source: z.string(),
  runtime: LOG_RUNTIME,
  platform: LOG_PLATFORM,
  deviceId: z.string().nullable(),
  clientId: z.string().nullable(),
  scope: z.string(),
  event: z.string(),
  level: LOG_LEVEL,
  payload: z.record(z.string(), z.unknown()),
  failure: FAILURE.nullable(),
  durationMs: z.number().nullable(),
  release: z.exactOptional(z.string()),
  bundle: z.exactOptional(z.string()),
  hubBootRunId: z.exactOptional(z.string()),
  repairOrigin: z.exactOptional(z.string()),
});

const SOURCE = z.strictObject({
  source: z.string(),
  runtime: LOG_RUNTIME,
  platform: LOG_PLATFORM,
  deviceId: z.string().nullable(),
  clientId: z.string().nullable(),
});

const ACCESS = z.strictObject({ owner: z.boolean(), profileId: z.string().nullable() });

export const LOG_REQUEST = z.discriminatedUnion('op', [
  z.strictObject({
    id: z.int(),
    clock: z.iso.datetime(),
    op: z.literal('append'),
    records: z.array(STORED_LOG_RECORD),
    clientId: z.string(),
    observe: z.boolean(),
    source: SOURCE,
    at: z.string(),
  }),
  z.strictObject({
    id: z.int(),
    clock: z.iso.datetime(),
    op: z.literal('ingest'),
    access: ACCESS,
    batch: RUNTIME_LOG_BATCH,
    source: SOURCE,
    deviceId: z.string().nullable(),
    now: z.string(),
  }),
  z.strictObject({
    id: z.int(),
    clock: z.iso.datetime(),
    op: z.literal('gap'),
    source: SOURCE,
    firstSentAt: z.string(),
    lastSentAt: z.string(),
  }),
  z.strictObject({
    id: z.int(),
    clock: z.iso.datetime(),
    op: z.literal('drop'),
    access: ACCESS,
    before: z.string().nullable(),
  }),
]);

export type LogRequest = z.infer<typeof LOG_REQUEST>;

export type LogRequestInput = z.input<typeof LOG_REQUEST>;

const EVIDENCE = z.strictObject({
  record: STORED_LOG_RECORD,
  fingerprint: z.string(),
  component: z.string(),
  logId: z.int().positive(),
});

export const LOG_REPLY = z.union([
  z.strictObject({
    id: z.int(),
    kept: z.int().nonnegative(),
    evidence: z.array(EVIDENCE).readonly(),
    ack: RUNTIME_LOG_ACK.nullable(),
  }),
  z.strictObject({ id: z.int(), changed: z.int().nonnegative() }),
  z.strictObject({ id: z.int(), failure: z.string() }),
  z.strictObject({
    swept: z.record(z.string(), z.int().nonnegative()),
    durationMs: z.number().nonnegative(),
  }),
  z.strictObject({ sweepFailure: z.string() }),
]);

export type LogReply = z.infer<typeof LOG_REPLY>;
