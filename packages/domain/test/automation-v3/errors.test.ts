import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ERROR_RETRY_RULES,
  FLOW_ERROR,
  errorClassFlags,
  errorRetryRule,
  isCatchableErrorClass,
} from '../../src/automation-v3/errors';
import {
  CATCHABLE_ERROR_CLASS,
  ERROR_CLASSES,
  RETRY,
  UNCATCHABLE_ERROR_CLASSES,
} from '../../src/automation-v3/policy';

const NODE_ID = '00000000-0000-4000-8000-00000000000a';

const base = {
  class: 'Failed',
  message: 'boom',
  node: NODE_ID,
  path: 'call#n3/loop#n7[4]/n9',
  attempt: 1,
  at: '2026-10-18T10:00:00+07:00',
};

describe('error value', () => {
  it('parses the required fields', () => {
    expect(FLOW_ERROR.parse(base)).toEqual(base);
  });

  it('parses a cause chain and detail', () => {
    const chained = {
      ...base,
      cause: { ...base, class: 'Timeout', cause: { ...base, class: 'Unreachable' } },
      detail: { budget: 'steps', limit: 5, used: [1, null] },
    };
    expect(FLOW_ERROR.parse(chained)).toEqual(chained);
  });

  it('rejects unknown classes, bad ids, empty paths, attempt zero and extra keys', () => {
    for (const bad of [
      { ...base, class: 'Aborted' },
      { ...base, node: 'n1' },
      { ...base, path: '' },
      { ...base, attempt: 0 },
      { ...base, at: 'yesterday' },
      { ...base, extra: true },
      { ...base, cause: { ...base, class: 'Nope' } },
    ]) {
      expect(FLOW_ERROR.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts every class in the closed set', () => {
    for (const name of ERROR_CLASSES) {
      expect(FLOW_ERROR.safeParse({ ...base, class: name }).success).toBe(true);
    }
  });
});

describe('class flags', () => {
  it('marks exactly the budget and cancel classes as not catchable', () => {
    for (const name of ERROR_CLASSES) {
      expect(isCatchableErrorClass(name)).toBe(!UNCATCHABLE_ERROR_CLASSES.some((u) => u === name));
      expect(isCatchableErrorClass(name)).toBe(CATCHABLE_ERROR_CLASS.safeParse(name).success);
    }
  });

  it('retries only Unreachable on idempotent effects and Timeout per node', () => {
    expect(errorRetryRule('Unreachable')).toBe('idempotent_only');
    expect(errorRetryRule('Timeout')).toBe('per_node');
    const others = ERROR_CLASSES.filter((name) => name !== 'Unreachable' && name !== 'Timeout');
    for (const name of others) expect(errorRetryRule(name)).toBe('never');
  });

  it('never retries what the retry policy refuses', () => {
    expect(
      RETRY.safeParse({ attempts: 2, backoff: 'fixed', initial: 5, on: ['Unknown'] }).success,
    ).toBe(false);
    expect(errorRetryRule('Unknown')).toBe('never');
  });

  it('gives every class a flag pair with a known retry rule', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ERROR_CLASSES), (name) => {
        const flags = errorClassFlags(name);
        expect(ERROR_RETRY_RULES).toContain(flags.retry);
        expect(typeof flags.catchable).toBe('boolean');
      }),
    );
  });
});
