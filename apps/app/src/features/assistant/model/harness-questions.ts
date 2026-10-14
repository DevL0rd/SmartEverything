import { z } from 'zod';

export const HARNESS_PERMISSION_REQUEST = z.object({
  tool_name: z.string().min(1).max(200),
  call_id: z.string().min(1).max(200).optional(),
  reason: z.string().max(16_000).optional(),
});
export const HARNESS_QUESTION = z.object({
  id: z.string().min(1).max(200),
  question: z.string().min(1).max(16_000),
  detail: z.string().max(100_000).optional(),
  header: z.string().max(200).optional(),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(2000),
        description: z.string().max(16_000).optional(),
      }),
    )
    .max(100)
    .optional(),
  multiSelect: z.boolean().optional(),
  intent: z
    .object({
      kind: z.string().min(1).max(200),
      approve: z.string().min(1).max(2000).optional(),
      callId: z.string().max(200).optional(),
    })
    .optional(),
});
export const HARNESS_QUESTION_REQUEST = z.object({
  questions: z
    .array(HARNESS_QUESTION)
    .min(1)
    .max(100)
    .refine(
      (questions) => new Set(questions.map((question) => question.id)).size === questions.length,
      'Question identifiers must be unique.',
    ),
});
export type HarnessQuestion = z.infer<typeof HARNESS_QUESTION>;
