import { describe, expect, it } from 'vitest';
import { PATCH_OPS } from '../../../src/graph/ops/schema';
import { chain, expectUndo, ok, refused } from './support';

describe('header', () => {
  it('changes lists, description, policy, admit and budgets and undoes them', () => {
    const ops = [
      {
        op: 'header' as const,
        description: 'Evening lights',
        variables: [{ name: 'count', type: { t: 'number' as const }, initial: { lit: 0 } }],
        policy: { mode: 'restart' as const },
        admit: { lit: true },
      },
    ];
    const done = ok(chain(), ops);
    expect(done.program).toMatchObject({
      description: 'Evening lights',
      policy: { mode: 'restart' },
      admit: { lit: true },
    });
    expectUndo(chain(), ops);
  });

  it('clears description and admit with null', () => {
    const set = ok(chain(), [{ op: 'header', description: 'x', admit: { lit: true } }]).program;
    const cleared = ok(set, [{ op: 'header', description: null, admit: null }]).program;
    expect('description' in cleared).toBe(false);
    expect('admit' in cleared).toBe(false);
  });

  it('names at least one field in the operation schema', () => {
    expect(PATCH_OPS.safeParse([{ op: 'header' }]).success).toBe(false);
    expect(PATCH_OPS.safeParse([{ op: 'header', description: null }]).success).toBe(true);
  });

  it('refuses a run policy on a Custom Node', () => {
    const custom = {
      version: 4 as const,
      kind: 'function' as const,
      flavour: 'pure' as const,
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      nodes: chain().nodes,
    };
    expect(refused(custom, [{ op: 'header', admit: { lit: true } }]).code).toBe('not_allowed');
  });
});
