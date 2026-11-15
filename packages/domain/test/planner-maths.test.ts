import { describe, expect, it } from 'vitest';
import {
  PLANNER_MATHS_DIFFICULTIES,
  plannerMathsProblemsOf,
  plannerMathsSeedOf,
  type PlannerMathsProblem,
} from '../src/index';

function valueOf(problem: PlannerMathsProblem): number {
  const [first = '', sign = '', second = '', , third = '0'] = problem.text.split(' ');
  const left = Number(first);
  const right = Number(second);
  if (sign === '×') return left * right + Number(third);
  return sign === '+' ? left + right : left - right;
}

describe('planner maths problems', () => {
  it('gives the same problems for the same alarm and day on every device', () => {
    const seed = plannerMathsSeedOf('alarm', 'a', '2026-11-14');
    expect(seed).toBe('alarm:a:2026-11-14');
    const today = plannerMathsProblemsOf(seed, 'medium', 3);
    expect(plannerMathsProblemsOf(seed, 'medium', 3)).toEqual(today);
    expect(
      plannerMathsProblemsOf(plannerMathsSeedOf('alarm', 'a', '2026-11-15'), 'medium', 3),
    ).not.toEqual(today);
    expect(today).toHaveLength(3);
  });

  it('writes each problem so its answer is right and positive, at every difficulty', () => {
    for (const difficulty of PLANNER_MATHS_DIFFICULTIES) {
      for (const problem of plannerMathsProblemsOf(`seed-${difficulty}`, difficulty, 200)) {
        expect(valueOf(problem)).toBe(problem.answer);
        expect(problem.answer).toBeGreaterThan(0);
      }
    }
  });

  it('adds a small number when easy, adds or takes away two digits when medium and multiplies when hard', () => {
    const easy = plannerMathsProblemsOf('shape', 'easy', 50);
    const medium = plannerMathsProblemsOf('shape', 'medium', 50);
    const hard = plannerMathsProblemsOf('shape', 'hard', 50);
    for (const problem of easy) expect(problem.text).toMatch(/^\d \+ \d{2}$/);
    for (const problem of medium) expect(problem.text).toMatch(/^\d{2} [+−] \d{2}$/);
    for (const problem of hard) expect(problem.text).toMatch(/^\d{1,2} × \d{2} \+ \d{2}$/);
    expect(medium.some((problem) => problem.text.includes('−'))).toBe(true);
    expect(medium.some((problem) => problem.text.includes('+'))).toBe(true);
  });
});
