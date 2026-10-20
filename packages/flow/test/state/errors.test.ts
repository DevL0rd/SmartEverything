import { ERROR_CLASSES, FLOW_ERROR, UNCATCHABLE_ERROR_CLASSES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  breachError,
  CATCHABLE,
  FLOW_ERRORS,
  flowError,
  isCatchable,
} from '../../src/state/errors';

const site = {
  node: '3f4b8c1e-5d2a-4b6e-8f10-2a9c7d3e6b51',
  path: 'body/2',
  at: Date.UTC(2026, 9, 18, 3, 30),
};

describe('error values', () => {
  it('have a constructor for every class', () => {
    expect(Object.keys(FLOW_ERRORS).toSorted()).toStrictEqual([...ERROR_CLASSES].toSorted());
  });

  it('build a valid error of their own class with attempt one', () => {
    for (const name of ERROR_CLASSES) {
      const error = FLOW_ERRORS[name]('went wrong', site);
      expect(FLOW_ERROR.parse(error)).toStrictEqual(error);
      expect(error).toStrictEqual({
        class: name,
        message: 'went wrong',
        node: site.node,
        path: 'body/2',
        attempt: 1,
        at: '2026-10-18T03:30:00.000Z',
      });
    }
  });

  it('carry the attempt, the cause and the detail when given', () => {
    const cause = FLOW_ERRORS.Unreachable('offline', site);
    const error = FLOW_ERRORS.Failed(
      'gave up',
      { ...site, attempt: 3 },
      { cause, detail: { n: 1 } },
    );
    expect(FLOW_ERROR.parse(error)).toStrictEqual(error);
    expect(error).toMatchObject({ attempt: 3, cause, detail: { n: 1 } });
  });

  it('leave out an absent cause and detail', () => {
    const error = flowError('Invalid', 'bad', site, { cause: undefined, detail: undefined });
    expect(Object.keys(error)).not.toContain('cause');
    expect(Object.keys(error)).not.toContain('detail');
  });
});

describe('catchable map', () => {
  it('lists budget and cancel errors as not catchable and the rest as catchable', () => {
    for (const name of ERROR_CLASSES) {
      const expected = !new Set<string>(UNCATCHABLE_ERROR_CLASSES).has(name);
      expect(CATCHABLE[name]).toBe(expected);
      expect(isCatchable(FLOW_ERRORS[name]('x', site))).toBe(expected);
    }
  });
});

describe('limit errors', () => {
  const runId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

  it('make a run budget breach a BudgetExceeded with its numbers', () => {
    const error = breachError({ budget: 'effects', limit: 20, used: 21 }, site, runId);
    expect(FLOW_ERROR.parse(error)).toStrictEqual(error);
    expect(error).toMatchObject({
      class: 'BudgetExceeded',
      message: 'effects limit 20 exceeded (21)',
      detail: { budget: 'effects', limit: 20, used: 21, nodePath: 'body/2', runId },
    });
    expect(isCatchable(error)).toBe(false);
  });

  it('make a node limit breach a catchable LimitExceeded and keep the extras', () => {
    const cause = FLOW_ERRORS.Failed('inner', site);
    const error = breachError({ budget: 'loop_iterations', limit: 3, used: 4 }, site, runId, {
      cause,
      detail: { extra: true },
    });
    expect(error).toMatchObject({
      class: 'LimitExceeded',
      cause,
      detail: { extra: true, budget: 'loop_iterations', runId },
    });
    expect(isCatchable(error)).toBe(true);
  });
});
