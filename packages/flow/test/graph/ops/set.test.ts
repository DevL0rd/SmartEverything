import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PATCH_OP } from '../../../src/graph/ops/schema';
import { automation, graphNode, ifNode, start, step } from '../graph-fixtures';
import { chain, expectUndo, nodeAt, ok, refused } from './support';

describe('set and unset', () => {
  it('sets ports, label, note, enabled and policy and clears them with null', () => {
    const done = ok(chain(), [
      {
        op: 'set',
        key: 'b',
        ports: { level: { lit: 80 } },
        label: 'Dim',
        note: 'evening',
        enabled: false,
        policy: { onError: 'continue' },
      },
    ]);
    expect(nodeAt(done.program, 'b')).toMatchObject({
      ports: { level: { lit: 80 } },
      label: 'Dim',
      note: 'evening',
      enabled: false,
      policy: { onError: 'continue' },
    });
    const cleared = ok(done.program, [
      { op: 'set', key: 'b', label: null, note: null, enabled: null, policy: null },
    ]);
    const node = nodeAt(cleared.program, 'b');
    expect(node.label).toBeUndefined();
    expect(node.policy).toBeUndefined();
    expect('enabled' in node).toBe(false);
  });

  it('sets and clears structured outputs of a decision', () => {
    const program = automation([start('d'), ifNode('d', [{ name: 'x' }])]);
    const outputs = [{ name: 'level', values: { then: { lit: 1 }, else: { lit: 2 } } }];
    const done = ok(program, [{ op: 'set', key: 'd', outputs }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(nodeAt(done.program, 'd').outputs).toEqual(outputs);
    const cleared = ok(done.program, [{ op: 'set', key: 'd', outputs: null }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(nodeAt(cleared.program, 'd').outputs).toBeUndefined();
  });

  it('refuses outputs on a kind that has none and policy on a trigger', () => {
    const outputs = [{ name: 'level', values: { then: { lit: 1 } } }];
    const result = refused(chain(), [{ op: 'set', key: 'b', outputs }]);
    expect(result.code).toBe('invalid_result');
    expect(result.problems.map((problem) => [problem.code, problem.key])).toEqual([
      ['outputs_on_wrong_kind', 'b'],
    ]);
    const withTrigger = ok(chain(), [
      { op: 'add', node: { kind: 'trigger.signal', key: 'sig', ports: {} } },
    ]).program;
    expect(
      refused(withTrigger, [{ op: 'set', key: 'sig', policy: { onError: 'fail' } }]).code,
    ).toBe('not_allowed');
    expect(refused(chain(), [{ op: 'set', key: 'nope', label: 'x' }]).code).toBe('unknown_key');
  });

  it('unsets ports and refuses a port that is not there', () => {
    const program = automation([
      start('a'),
      step('a', undefined, { ports: { x: { lit: 1 }, y: { lit: 2 } } }),
    ]);
    const one = ok(program, [{ op: 'unset', key: 'a', ports: ['x'] }]);
    expect(nodeAt(one.program, 'a').ports).toEqual({ y: { lit: 2 } });
    const all = ok(program, [{ op: 'unset', key: 'a', ports: ['x', 'y'] }]);
    expect(nodeAt(all.program, 'a').ports).toBeUndefined();
    const kept = ok(program, [{ op: 'unset', key: 'a', ports: ['x', 'y'], keepEmpty: true }]);
    expect(nodeAt(kept.program, 'a').ports).toEqual({});
    expect(refused(program, [{ op: 'unset', key: 'a', ports: ['z'] }]).code).toBe('unknown_port');
  });

  it('undoes set and unset', () => {
    const program = automation([start('a'), step('a', undefined, { ports: { x: { lit: 1 } } })]);
    expectUndo(program, [
      { op: 'set', key: 'a', ports: { x: { lit: 5 }, y: { lit: 6 } }, label: 'L' },
    ]);
    expectUndo(program, [{ op: 'unset', key: 'a', ports: ['x'] }]);
  });

  it('sets the run mode and the timeout inside the policy and keeps its other fields', () => {
    const program = automation([
      start('a'),
      step('a', undefined, {
        policy: { onError: 'continue', retry: { attempts: 2, backoff: 'fixed', initial: 500 } },
      }),
    ]);
    const done = ok(program, [{ op: 'set', key: 'a', mode: 'wait_for_result', timeout: 8000 }]);
    expect(nodeAt(done.program, 'a').policy).toEqual({
      onError: 'continue',
      retry: { attempts: 2, backoff: 'fixed', initial: 500 },
      mode: 'wait_for_result',
      timeout: 8000,
    });
    const timeoutOnly = ok(done.program, [{ op: 'set', key: 'a', timeout: null }]);
    expect(nodeAt(timeoutOnly.program, 'a').policy).toEqual({
      onError: 'continue',
      retry: { attempts: 2, backoff: 'fixed', initial: 500 },
      mode: 'wait_for_result',
    });
    const bare = ok(automation([start('a'), step('a')]), [
      { op: 'set', key: 'a', mode: 'fire_and_forget' },
    ]);
    expect(nodeAt(bare.program, 'a').policy).toEqual({ mode: 'fire_and_forget' });
    const emptied = ok(bare.program, [{ op: 'set', key: 'a', mode: null }]);
    expect(nodeAt(emptied.program, 'a').policy).toBeUndefined();
  });

  it('applies a whole policy before the mode and timeout of the same operation', () => {
    const done = ok(chain(), [
      { op: 'set', key: 'b', policy: { onError: 'fail' }, mode: 'wait_for_result', timeout: 100 },
    ]);
    expect(nodeAt(done.program, 'b').policy).toEqual({
      onError: 'fail',
      mode: 'wait_for_result',
      timeout: 100,
    });
  });

  it('undoes a mode and timeout change exactly', () => {
    const program = automation([
      start('a'),
      step('a', undefined, { policy: { onError: 'continue', mode: 'fire_and_forget' } }),
    ]);
    expectUndo(program, [{ op: 'set', key: 'a', mode: 'wait_for_result', timeout: 5000 }]);
    expectUndo(program, [{ op: 'set', key: 'a', mode: null }]);
    expectUndo(automation([start('a'), step('a')]), [
      { op: 'set', key: 'a', mode: 'wait_for_result', timeout: 5000 },
    ]);
  });

  it('refuses a mode the kind does not offer and a mode or timeout on a trigger', () => {
    const asking = automation([start('q'), graphNode('q', 'notify.ask')]);
    const result = refused(asking, [{ op: 'set', key: 'q', mode: 'fire_and_forget' }]);
    expect(result.code).toBe('not_allowed');
    expect(result.reason).toContain('wait_for_result');
    expect(
      ok(asking, [{ op: 'set', key: 'q', mode: 'wait_for_result' }], {
        kinds: STATIC_KIND_LOOKUP,
        allowProblems: true,
      }),
    );
    const withTrigger = ok(chain(), [
      { op: 'add', node: { kind: 'trigger.signal', key: 'sig', ports: {} } },
    ]).program;
    expect(refused(withTrigger, [{ op: 'set', key: 'sig', mode: 'wait_for_result' }]).code).toBe(
      'not_allowed',
    );
    expect(refused(withTrigger, [{ op: 'set', key: 'sig', timeout: 100 }]).code).toBe(
      'not_allowed',
    );
  });

  it('rejects an unknown mode and a timeout that is not a positive whole number', () => {
    expect(PATCH_OP.safeParse({ op: 'set', key: 'a', mode: 'later' }).success).toBe(false);
    expect(PATCH_OP.safeParse({ op: 'set', key: 'a', timeout: 0 }).success).toBe(false);
    expect(PATCH_OP.safeParse({ op: 'set', key: 'a', timeout: 1.5 }).success).toBe(false);
    expect(PATCH_OP.safeParse({ op: 'set', key: 'a', mode: null, timeout: null }).success).toBe(
      true,
    );
  });
});
