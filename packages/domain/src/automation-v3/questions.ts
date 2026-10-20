import { z } from 'zod';
import { ID, MOMENT } from '../api/primitives';
import { AUTOMATION_NAME } from '../api/rows-media';

const TEXT = z.string().min(1);

export const QUESTION_STATES = ['open', 'answered', 'closed'] as const;

export const AUTOMATION_QUESTION = z.strictObject({
  id: TEXT,
  automation_id: ID,
  automation_name: AUTOMATION_NAME,
  run_id: ID,
  person_id: ID,
  question: TEXT,
  options: z.array(TEXT).min(2).max(4),
  state: z.enum(QUESTION_STATES),
  answer: TEXT.nullable(),
  answered_by: ID.nullable(),
  deadline_at: MOMENT.nullable(),
  created_at: MOMENT,
  answered_at: MOMENT.nullable(),
});

export const AUTOMATION_QUESTION_ANSWER = z.strictObject({ answer: TEXT });

export type AutomationQuestion = z.infer<typeof AUTOMATION_QUESTION>;
export type AutomationQuestionAnswer = z.infer<typeof AUTOMATION_QUESTION_ANSWER>;
