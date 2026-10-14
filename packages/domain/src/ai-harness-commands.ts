import { z } from 'zod';
import { DSH_SESSION_ID } from './dsh-sessions';
import { ASSISTANT_ATTACHMENT_BYTES_MAX } from './assistant';

export const AI_HARNESS_COMMAND_DESCRIPTOR = z.object({
  definitionId: z.string().min(1).max(200).optional(),
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_-]*$/)
    .max(200),
  description: z.string().min(1).max(16_000),
  input: z.object({ hint: z.string().max(2000), attachments: z.boolean().optional() }).optional(),
});
export const AI_HARNESS_COMMAND_DESCRIPTORS = z.array(AI_HARNESS_COMMAND_DESCRIPTOR).max(2000);
export type AiHarnessCommandDescriptor = z.infer<typeof AI_HARNESS_COMMAND_DESCRIPTOR>;
export const AI_HARNESS_COMMAND_ATTACHMENT = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('image'),
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    data: z.base64().max(Math.ceil(ASSISTANT_ATTACHMENT_BYTES_MAX / 3) * 4),
    name: z.string().min(1).max(200).optional(),
  }),
  z.strictObject({ type: z.literal('file'), receiptId: z.string().min(1).max(200) }),
]);
export const AI_HARNESS_COMMAND_EXECUTION = z.object({
  commandId: z.string().min(1).max(200),
  result: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('success'),
      text: z.string().max(200_000).optional(),
      sourceEventSeq: z.int().nonnegative().optional(),
    }),
    z.object({ kind: z.literal('error'), text: z.string().max(200_000) }),
  ]),
});
export const AI_HARNESS_COMMAND_OUTCOME = z.discriminatedUnion('status', [
  z.object({ status: z.literal('settled'), execution: AI_HARNESS_COMMAND_EXECUTION }),
  z.object({ status: z.literal('rejected'), message: z.string().min(1).max(2000) }),
  z.object({ status: z.literal('unknown'), message: z.string().min(1).max(2000) }),
]);
export type AiHarnessCommandOutcome = z.infer<typeof AI_HARNESS_COMMAND_OUTCOME>;
export const AI_HARNESS_COMMAND_SCOPE = {
  session_id: DSH_SESSION_ID,
  expected_epoch: z.int().positive(),
};
export const AI_HARNESS_COMMAND_LIST = z.strictObject(AI_HARNESS_COMMAND_SCOPE);
export type AiHarnessCommandScope = z.infer<typeof AI_HARNESS_COMMAND_LIST>;
export const AI_HARNESS_COMMAND_WRITE = z.strictObject({
  ...AI_HARNESS_COMMAND_SCOPE,
  operation_id: z.uuid(),
  line: z.string().min(1).max(200_000),
  attachments: z.array(AI_HARNESS_COMMAND_ATTACHMENT).max(20).default([]),
});
export type AiHarnessCommandWrite = z.infer<typeof AI_HARNESS_COMMAND_WRITE>;
export const AI_HARNESS_COMMAND_CATALOGUE = z.object({
  session_id: DSH_SESSION_ID,
  epoch: z.int().positive(),
  commands: AI_HARNESS_COMMAND_DESCRIPTORS,
});
