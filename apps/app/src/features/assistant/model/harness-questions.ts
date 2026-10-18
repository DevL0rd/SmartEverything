import { z } from 'zod';

export const HARNESS_PERMISSION_REQUEST = z.object({
  tool_name: z.string().min(1),
  call_id: z.string().min(1).optional(),
  reason: z.string().optional(),
});
const HARNESS_QUESTION = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  detail: z.string().optional(),
  header: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .optional(),
  multiSelect: z.boolean().optional(),
  intent: z
    .object({
      kind: z.string().min(1),
      approve: z.string().min(1).optional(),
      callId: z.string().optional(),
    })
    .optional(),
});
export const HARNESS_QUESTION_REQUEST = z.object({
  questions: z
    .array(HARNESS_QUESTION)
    .min(1)
    .refine(
      (questions) => new Set(questions.map((question) => question.id)).size === questions.length,
      'Question identifiers must be unique.',
    ),
});
export type HarnessQuestion = z.infer<typeof HARNESS_QUESTION>;
