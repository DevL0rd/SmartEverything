import { describe, expect, it } from 'vitest';
import { automation, fn, node, ok, refused, roundTrip } from './support';

const base = (): ReturnType<typeof automation> => ({
  ...automation([node('a', 'notify.feed')]),
  description: 'Old',
  admit: { lit: true },
  inputs: [{ name: 'level', type: { t: 'number' }, required: false }],
});

describe('header', () => {
  it('replaces variables, inputs, outputs, policy, admit and description, and undoes it', () => {
    const result = roundTrip(base(), [
      {
        op: 'header',
        variables: [{ name: 'v', type: { t: 'number' }, initial: { lit: 1 } }],
        inputs: [],
        outputs: [{ name: 'done', type: { t: 'boolean' } }],
        policy: { mode: 'restart', timeout: 1000 },
        admit: { lit: false },
        description: 'New',
      },
    ]);
    expect(result).toMatchObject({
      description: 'New',
      admit: { lit: false },
      policy: { mode: 'restart' },
    });
  });

  it('clears the description and the admit rule, and restores them', () => {
    const cleared = roundTrip(base(), [{ op: 'header', description: null, admit: null }]);
    expect(cleared).not.toHaveProperty('description');
    expect(cleared).not.toHaveProperty('admit');
    const bare = automation([]);
    const set = roundTrip(bare, [{ op: 'header', description: 'Hello', admit: { lit: true } }]);
    expect(set).toMatchObject({ description: 'Hello' });
  });

  it('changes the policy alone', () => {
    const result = roundTrip(base(), [{ op: 'header', policy: { mode: 'queue', max: 3 } }]);
    expect(result).toMatchObject({ policy: { mode: 'queue', max: 3 } });
  });

  it('sets and clears runtime budgets, and undoes it', () => {
    const result = roundTrip(base(), [
      { op: 'header', budgets: { startBucket: 'on', stepsTotal: 9 } },
    ]);
    expect(result).toMatchObject({ budgets: { startBucket: 'on', stepsTotal: 9 } });
    const cleared = roundTrip(result, [{ op: 'header', budgets: null }]);
    expect(cleared).not.toHaveProperty('budgets');
    expect(refused(fn([node('a', 'notify.feed')]), [{ op: 'header', budgets: {} }]).code).toBe(
      'not_allowed',
    );
  });

  it('changes a reusable node header but not its policy', () => {
    const program = fn([node('a', 'notify.feed')]);
    roundTrip(program, [
      { op: 'header', description: 'Why', outputs: [{ name: 'r', type: { t: 'number' } }] },
    ]);
    expect(refused(program, [{ op: 'header', policy: { mode: 'single' } }]).code).toBe(
      'not_allowed',
    );
    expect(refused(program, [{ op: 'header', admit: null }]).code).toBe('not_allowed');
  });

  it('refuses a header that breaks the program', () => {
    const result = refused(base(), [
      {
        op: 'header',
        variables: [
          { name: 'v', type: { t: 'number' }, initial: { lit: 1 } },
          { name: 'v', type: { t: 'number' }, initial: { lit: 2 } },
        ],
      },
    ]);
    expect(result.code).toBe('invalid_result');
    expect(result.reason).toContain('variable "v" is used more than once');
    expect(ok(base(), [{ op: 'header', description: 'x' }]).inverse).toEqual([
      { op: 'header', description: 'Old' },
    ]);
  });
});
