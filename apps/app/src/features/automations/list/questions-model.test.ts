import type { AutomationQuestion } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { questionLines, questionsTitle } from './questions-model';

const ID = '3a000000-0000-4000-8000-000000000001';

function question(extra: Partial<AutomationQuestion> = {}): AutomationQuestion {
  return {
    id: 'run/f0:1',
    automation_id: ID,
    automation_name: 'Front door',
    run_id: ID,
    person_id: ID,
    question: 'Lock the door?',
    options: ['Yes', 'No'],
    state: 'open',
    answer: null,
    answered_by: null,
    deadline_at: null,
    created_at: '2026-10-19T09:00:00.000Z',
    answered_at: null,
    ...extra,
  };
}

describe('waiting questions', () => {
  it('names the automation, the question and its buttons', () => {
    expect(questionLines([question()], 'UTC')).toEqual([
      {
        id: 'run/f0:1',
        automation: 'Front door',
        question: 'Lock the door?',
        options: ['Yes', 'No'],
        deadline: null,
      },
    ]);
  });

  it('says by when to answer in the home time zone', () => {
    const [line] = questionLines([question({ deadline_at: '2026-10-19T09:30:00.000Z' })], 'UTC');
    expect(line?.deadline).toMatch(/^Answer by 9:30/);
  });

  it('titles one question and many', () => {
    expect(questionsTitle(1)).toBe('Waiting for your answer');
    expect(questionsTitle(3)).toBe('3 questions waiting for you');
  });
});
