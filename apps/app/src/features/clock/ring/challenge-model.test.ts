import { plannerMathsProblemsOf } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  FIRST_ENTRY,
  challengePlanOf,
  eraseDigit,
  mathsSolved,
  qrRefusalOf,
  stepsProgressOf,
  submitAnswer,
  typeDigit,
  type MathsEntry,
} from './challenge-model';

function typed(entry: MathsEntry, answer: number): MathsEntry {
  return String(answer).match(/\d/g)?.reduce(typeDigit, entry) ?? entry;
}

describe('maths entry', () => {
  const problems = plannerMathsProblemsOf('entry', 'easy', 2);
  const [first, second] = problems;

  it('types and erases digits', () => {
    const entry = typeDigit(typeDigit(FIRST_ENTRY, '4'), '2');
    expect(entry.typed).toBe('42');
    expect(eraseDigit(entry).typed).toBe('4');
    expect(eraseDigit(FIRST_ENTRY).typed).toBe('');
  });

  it('clears a wrong answer and keeps the same problem', () => {
    if (first === undefined) throw new Error('no problem');
    const wrong = submitAnswer(typed(FIRST_ENTRY, first.answer + 1), problems);
    expect(wrong).toEqual({ index: 0, typed: '', wrong: true });
    expect(typeDigit(wrong, '1').wrong).toBe(false);
  });

  it('ignores an empty answer', () => {
    expect(submitAnswer(FIRST_ENTRY, problems)).toBe(FIRST_ENTRY);
  });

  it('moves to the next problem on a right answer and is solved after the last', () => {
    if (first === undefined || second === undefined) throw new Error('no problems');
    const next = submitAnswer(typed(FIRST_ENTRY, first.answer), problems);
    expect(next).toEqual({ index: 1, typed: '', wrong: false });
    expect(mathsSolved(next, problems)).toBe(false);
    const done = submitAnswer(typed(next, second.answer), problems);
    expect(mathsSolved(done, problems)).toBe(true);
  });
});

describe('other challenges', () => {
  it('accepts only the registered code, ignoring spaces around it', () => {
    expect(qrRefusalOf(' bathroom-mirror ', 'bathroom-mirror')).toBeNull();
    expect(qrRefusalOf('kitchen', 'bathroom-mirror')).toBe('That is not the code for this alarm');
  });

  it('fills the steps ring up to the target', () => {
    expect(stepsProgressOf(0, 30)).toBe(0);
    expect(stepsProgressOf(15, 30)).toBe(0.5);
    expect(stepsProgressOf(45, 30)).toBe(1);
  });

  it('runs maths anywhere and sends code and steps challenges to the phone', () => {
    const maths = { kind: 'maths', difficulty: 'hard', count: 2 } as const;
    expect(challengePlanOf(maths, false)).toBe(maths);
    expect(challengePlanOf({ kind: 'none' }, false)).toEqual({ kind: 'none' });
    expect(challengePlanOf({ kind: 'qr', code: 'x' }, true)).toEqual({ kind: 'qr', code: 'x' });
    expect(challengePlanOf({ kind: 'qr', code: 'x' }, false)).toEqual({
      kind: 'phone',
      what: 'qr',
    });
    expect(challengePlanOf({ kind: 'steps', steps: 20 }, false)).toEqual({
      kind: 'phone',
      what: 'steps',
    });
  });
});
