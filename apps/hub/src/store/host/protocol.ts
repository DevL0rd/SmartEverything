import { LOG_RECORD } from '@smarteverything/domain';
import { LOG_LEVELS } from '@smarteverything/logging';
import { z } from 'zod';
import { DRIVE_FOLDERS } from '../../data-layout/drive-folders';
import type { CommittedSpeech } from '../../transcripts/speech';

export const HOST_DATA = z.strictObject({
  path: z.string().min(1),
  driveFolders: DRIVE_FOLDERS.nullable(),
  busyTimeoutMs: z.int().positive(),
  readOnly: z.boolean(),
  level: z.enum(LOG_LEVELS),
  release: z.string().min(1),
  now: z.iso.datetime(),
});

export type HostData = z.output<typeof HOST_DATA>;

export const HOST_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unit'), name: z.string().min(1) }),
  z.strictObject({ kind: z.literal('repository'), path: z.array(z.string().min(1)).min(2) }),
]);

export type HostTarget = z.output<typeof HOST_TARGET>;

export const TO_HOST = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('call'),
    id: z.int(),
    now: z.iso.datetime(),
    target: HOST_TARGET,
    input: z.unknown(),
  }),
  z.strictObject({ type: z.literal('commit') }),
]);

export type ToHost = z.input<typeof TO_HOST>;

const COMMITTED_SPEECH = z.custom<CommittedSpeech>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === 'transcript' || value.kind === 'attachment'),
);

export const HOST_EVENT = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('row'), change: z.unknown() }),
  z.strictObject({ kind: z.literal('notice'), notice: z.unknown() }),
  z.strictObject({ kind: z.literal('speech'), speech: COMMITTED_SPEECH }),
  z.strictObject({ kind: z.literal('access') }),
]);

export type HostEvent = z.output<typeof HOST_EVENT>;

export const HOST_ERROR = z.strictObject({
  name: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  fields: z.record(z.string(), z.string()),
});

export type HostError = z.output<typeof HOST_ERROR>;

const SETTLED = {
  id: z.int(),
  events: z.array(HOST_EVENT),
  committed: z.boolean(),
};

export const FROM_HOST = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('reply'), ...SETTLED, value: z.unknown() }),
  z.strictObject({ type: z.literal('failure'), ...SETTLED, error: HOST_ERROR }),
  z.strictObject({ type: z.literal('log'), record: LOG_RECORD }),
]);

export type FromHost = z.input<typeof FROM_HOST>;
