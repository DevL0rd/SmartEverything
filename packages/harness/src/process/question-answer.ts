import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
export const QUESTION_ANSWER = z.strictObject({
  answers: z.array(
    z.strictObject({
      id: z.string().min(1),
      selected: z.array(z.string()),
      custom: z.string().max(16_000).optional(),
    }),
  ),
});
const QUESTIONS = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      options: z.array(z.object({ label: z.string() })).optional(),
      multiSelect: z.boolean().optional(),
    }),
  ),
});
export function admitQuestionAnswer(
  request: unknown,
  value: unknown,
): z.infer<typeof QUESTION_ANSWER> {
  const pending = QUESTIONS.parse(request).questions;
  const answer = QUESTION_ANSWER.parse(value);
  const ids = answer.answers.map((item) => item.id);
  if (
    answer.answers.length !== pending.length ||
    new Set(ids).size !== ids.length ||
    pending.some((item) => !ids.includes(item.id))
  )
    refuse();
  for (const item of answer.answers) {
    const question = pending.find((question) => question.id === item.id);
    if (question === undefined) refuse();
    admitItem(question, item);
  }
  return answer;
}
function admitItem(
  question: z.infer<typeof QUESTIONS>['questions'][number],
  item: z.infer<typeof QUESTION_ANSWER>['answers'][number],
): void {
  const labels = question.options?.map((option) => option.label) ?? [];
  if (
    new Set(item.selected).size !== item.selected.length ||
    item.selected.some((label) => !labels.includes(label))
  )
    refuse();
  admitCardinality(question.multiSelect === true, item.selected.length, item.custom);
}
function admitCardinality(multi: boolean, selected: number, text: string | undefined): void {
  const custom = text?.trim();
  const selections = selected + (custom === undefined || custom === '' ? 0 : 1);
  if (selections === 0 || (!multi && selections !== 1) || (text !== undefined && custom === ''))
    refuse();
}
function refuse(): never {
  throw new HarnessRuntimeError(
    'operation_failed',
    'Answer does not match the pending question identifiers, options or selection rules.',
  );
}
