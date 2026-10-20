import type { AutomationQuestion } from '@smarteverything/domain';
import { clock } from '../../../format/time';

export interface QuestionLine {
  readonly id: string;
  readonly automation: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly deadline: string | null;
}

export function questionLines(
  questions: readonly AutomationQuestion[],
  timeZone: string | null,
): readonly QuestionLine[] {
  return questions.map((question) => ({
    id: question.id,
    automation: question.automation_name,
    question: question.question,
    options: question.options,
    deadline:
      question.deadline_at === null ? null : `Answer by ${clock(question.deadline_at, timeZone)}`,
  }));
}

export function questionsTitle(count: number): string {
  return count === 1 ? 'Waiting for your answer' : `${String(count)} questions waiting for you`;
}
