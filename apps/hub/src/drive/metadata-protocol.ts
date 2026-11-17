import { DRIVE_CAMERA, DRIVE_EXPOSURE } from '@smarteverything/domain';
import { z } from 'zod';
import type { MediaFacts } from './metadata-read';

const COUNT = z.int().nonnegative();

const MOMENT = z.strictObject({
  iso: z.string(),
  offsetMin: z.number().nullable(),
  source: z.enum(['metadata', 'container', 'modified']),
});

export const MEDIA_FACTS: z.ZodType<MediaFacts> = z.strictObject({
  takenAt: MOMENT.nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  orientation: z.number().nullable(),
  camera: DRIVE_CAMERA.nullable(),
  exposure: DRIVE_EXPOSURE.nullable(),
  place: z.strictObject({ lat: z.number(), lon: z.number() }).nullable(),
  durationMs: z.number().nullable(),
  description: z.string().nullable(),
});

export const METADATA_REQUEST = z.strictObject({
  id: COUNT,
  rootPath: z.string().min(1),
  relPath: z.string().min(1),
  dev: z.string().min(1),
  ino: z.string().min(1),
});

export type MetadataRequest = z.infer<typeof METADATA_REQUEST>;

export const METADATA_OUTCOME = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('read'),
    facts: MEDIA_FACTS,
    bytes: COUNT,
    modifiedMs: z.number(),
    unreadable: z.string().nullable(),
  }),
  z.strictObject({ kind: z.literal('changed'), reason: z.enum(['identity', 'modified']) }),
  z.strictObject({ kind: z.literal('skipped'), reason: z.string().min(1) }),
]);

export type MetadataOutcome = z.infer<typeof METADATA_OUTCOME>;

export const METADATA_RESPONSE = z.strictObject({ id: COUNT, outcome: METADATA_OUTCOME });
