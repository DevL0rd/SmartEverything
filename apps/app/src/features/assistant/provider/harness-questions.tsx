import type { ReactNode } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { DecisionQuestions } from '../../../components/decision-questions';
import type { HarnessQuestion } from '../model/harness-questions';
export function HarnessQuestions({
  questions,
  pending,
  submit,
}: {
  readonly questions: readonly HarnessQuestion[];
  readonly pending: boolean;
  readonly submit: (answer: JsonValue) => void;
}): ReactNode {
  return (
    <DecisionQuestions
      pending={pending}
      questions={questions.map((question) => ({
        id: question.id,
        title: question.question,
        ...(question.header === undefined ? {} : { header: question.header }),
        ...(question.detail === undefined ? {} : { detail: question.detail }),
        options:
          question.options === undefined
            ? []
            : question.options.map((option) => ({
                id: option.label,
                label: option.label,
                ...(option.description === undefined ? {} : { description: option.description }),
              })),
        multi: question.multiSelect === true,
        custom: true,
        secret: false,
      }))}
      submit={(answers) => {
        submit({
          answers: answers.map((item) => ({
            id: item.id,
            selected: [...item.selected],
            ...(item.custom.trim() === '' ? {} : { custom: item.custom }),
          })),
        });
      }}
    />
  );
}
