import { z } from 'zod';

const ID = z.uuid();

export const PLANNER_ATTACHMENT_KINDS = ['device', 'scene', 'automation', 'file', 'link'] as const;

export type PlannerAttachmentKind = (typeof PLANNER_ATTACHMENT_KINDS)[number];

export const PLANNER_ATTACHMENT = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('device'),
      deviceId: ID,
      face: z.string().trim().min(1).nullable(),
    }),
    z.strictObject({ kind: z.literal('scene'), sceneId: ID }),
    z.strictObject({ kind: z.literal('automation'), automationId: ID }),
    z.strictObject({ kind: z.literal('file'), fileId: z.string().trim().min(1) }),
    z.strictObject({
      kind: z.literal('link'),
      url: z.url({ protocol: /^https?$/ }),
      title: z.string().trim().min(1).nullable(),
    }),
  ])
  .readonly();

export type PlannerAttachment = z.infer<typeof PLANNER_ATTACHMENT>;
