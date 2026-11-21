import { LOG_RECORD } from '@smarteverything/domain';
import { LOG_LEVELS } from '@smarteverything/logging';
import { z } from 'zod';

const ID = z.int().positive();

const BYTES = z.custom<Uint8Array>((value) => value instanceof Uint8Array);

export const CODEC_DATA = z.strictObject({
  level: z.enum(LOG_LEVELS),
  release: z.string().min(1),
});

export type CodecData = z.output<typeof CODEC_DATA>;

const GLB_LEVEL = z.strictObject({
  level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  bytes: BYTES,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  triangles: z.int().nonnegative(),
});

export const CODEC_JOB = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('response'),
    endpoint: z.string().min(1),
    text: z.string(),
    member: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('body'),
    endpoint: z.string().min(1),
    bytes: BYTES,
  }),
  z.strictObject({
    kind: z.literal('calendar'),
    text: z.string(),
    defaultZone: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('inference'), bytes: BYTES }),
  z.strictObject({ kind: z.literal('glb'), bytes: BYTES }),
]);

export type CodecJob = z.output<typeof CODEC_JOB>;

export const CODEC_REQUEST = z.strictObject({ id: ID, job: CODEC_JOB });

export type CodecRequest = z.output<typeof CODEC_REQUEST>;

export const CODEC_REPLY = z.discriminatedUnion('kind', [
  z.strictObject({ id: ID, kind: z.literal('encoded'), text: z.string() }),
  z.strictObject({ id: ID, kind: z.literal('invalid'), issueCodes: z.array(z.string()) }),
  z.strictObject({ id: ID, kind: z.literal('body'), value: z.unknown() }),
  z.strictObject({ id: ID, kind: z.literal('body_not_json') }),
  z.strictObject({ id: ID, kind: z.literal('body_invalid'), detail: z.string() }),
  z.strictObject({ id: ID, kind: z.literal('calendar'), calendar: z.unknown() }),
  z.strictObject({ id: ID, kind: z.literal('calendar_unreadable'), reason: z.string() }),
  z.strictObject({
    id: ID,
    kind: z.literal('glb'),
    triangles: z.int().nonnegative(),
    levels: z.tuple([GLB_LEVEL, GLB_LEVEL, GLB_LEVEL]),
  }),
  z.strictObject({
    id: ID,
    kind: z.literal('glb_refused'),
    stage: z.enum(['check', 'lod']),
    problem: z.string().min(1),
  }),
  z.strictObject({ id: ID, kind: z.literal('failed'), message: z.string() }),
]);

export type CodecReply = z.output<typeof CODEC_REPLY>;

export const CODEC_LOG = z.strictObject({ kind: z.literal('log'), record: LOG_RECORD });

export const FROM_CODEC = z.union([CODEC_LOG, CODEC_REPLY]);

export type FromCodec = z.input<typeof FROM_CODEC>;
