import type { ReactNode } from 'react';
import type { ClaudePrompt } from '@smarteverything/domain';
import { DecisionQuestions } from '../../../components/decision-questions';
export interface QuestionAnswer {
  readonly question: string;
  readonly choices: readonly string[];
}
export function PromptQuestions({
  questions,
  pending,
  submit,
  custom = false,
}: {
  readonly questions: ClaudePrompt['questions'];
  readonly pending: boolean;
  readonly submit: (answers: readonly QuestionAnswer[]) => void;
  readonly custom?: boolean;
}): ReactNode {
  return (
    <DecisionQuestions
      pending={pending}
      questions={questions.map((question, index) => ({
        id: String(index),
        title: question.question,
        ...(question.header === null ? {} : { header: question.header }),
        options: question.options.map((option) => ({
          id: option.label,
          label: option.label,
          ...(option.description === null ? {} : { description: option.description }),
        })),
        multi: question.multi_select,
        custom,
        secret: false,
      }))}
      submit={(answers) => {
        submit(
          answers.map((answer, index) => {
            const question = questions[index];
            if (question === undefined) throw new Error('Claude question identity changed.');
            return {
              question: question.question,
              choices: [
                ...answer.selected,
                ...(answer.custom.trim() === '' ? [] : [answer.custom]),
              ],
            };
          }),
        );
      }}
    />
  );
}
