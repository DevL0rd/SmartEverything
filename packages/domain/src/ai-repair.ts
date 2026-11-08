import { z } from 'zod';

export const AI_REPAIR_SETTINGS = z.strictObject({ enabled: z.boolean() });

export type AiRepairSettings = z.infer<typeof AI_REPAIR_SETTINGS>;

export const AI_REPAIR_FINGERPRINT = z.string().regex(/^[0-9a-f]{64}$/u);

export const AI_REPAIR_ADMISSION = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('queued'), eventId: z.uuid(), chatId: z.uuid() }),
  z.strictObject({ kind: z.literal('existing'), eventId: z.uuid(), chatId: z.uuid() }),
  z.strictObject({
    kind: z.literal('held'),
    reason: z.enum(['origin', 'evidence', 'owner', 'unavailable', 'disabled', 'busy', 'budget']),
  }),
]);

export type AiRepairAdmission = z.infer<typeof AI_REPAIR_ADMISSION>;

export const AI_REPAIR_GROUP = z.strictObject({
  fingerprint: AI_REPAIR_FINGERPRINT,
  component: z.string().min(1),
  event: z.string().min(1),
  firstAt: z.iso.datetime(),
  lastAt: z.iso.datetime(),
  observations: z.number().int().positive(),
  latestLogId: z.number().int().positive().nullable(),
  admission: AI_REPAIR_ADMISSION.nullable().optional(),
  progress: z
    .enum(['queued', 'running', 'finished', 'failed', 'unavailable'])
    .nullable()
    .optional(),
});

export type AiRepairGroup = z.infer<typeof AI_REPAIR_GROUP>;

export const AI_REPAIR_CURSOR = AI_REPAIR_GROUP.pick({ lastAt: true, fingerprint: true });

export const AI_REPAIR_PAGE = z.strictObject({
  groups: z.array(AI_REPAIR_GROUP),
  next: AI_REPAIR_CURSOR.nullable(),
  automaticHold: z.enum(['disabled', 'unavailable']).optional(),
});

export type AiRepairPage = z.infer<typeof AI_REPAIR_PAGE>;

export const AI_REPAIR_DISMISSAL = z.discriminatedUnion('kind', [
  AI_REPAIR_GROUP.pick({ fingerprint: true, observations: true }).extend({
    kind: z.literal('group'),
  }),
  z.strictObject({ kind: z.literal('inactive') }),
]);

export type AiRepairDismissal = z.infer<typeof AI_REPAIR_DISMISSAL>;

const REPAIR_SOURCE_PATH =
  /^(?:apps\/(?:app|hub|desktop)|packages\/[a-z][a-z0-9-]*)\/src\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.tsx?$/u;

export const AI_REPAIR_SOURCE_PATH = z.string().max(240).regex(REPAIR_SOURCE_PATH);
export const AI_REPAIR_SOURCE_REVISION = z.string().regex(/^[0-9a-f]{40}$/u);

export const AI_REPAIR_PATCH_REQUEST = z.strictObject({
  requestId: z.uuid(),
  revision: AI_REPAIR_SOURCE_REVISION,
  paths: z
    .array(AI_REPAIR_SOURCE_PATH)
    .min(1)
    .max(3)
    .refine((paths) => new Set(paths).size === paths.length, {
      message: 'Choose each file only once.',
    }),
});

export type AiRepairPatchRequest = z.infer<typeof AI_REPAIR_PATCH_REQUEST>;
