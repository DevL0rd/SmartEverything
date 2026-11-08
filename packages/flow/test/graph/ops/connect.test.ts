import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { canConnect } from '../../../src/graph/ops/can-connect';
import {
  automation,
  ifNode,
  join,
  loop,
  start,
  step,
  stop,
  together,
  value,
} from '../graph-fixtures';
import { chain, expectStructured, expectUndo, nodeAt, ok, refused, toOf } from './support';

function reason(program: ReturnType<typeof chain>, from: string, port: string, to: string): string {
  const verdict = canConnect(program, { from, port, to }, STATIC_KIND_LOOKUP);
  return verdict.ok ? 'ok' : verdict.reason;
}

const looped = automation([
  start('before'),
  step('before', 'each'),
  loop('each', 'flow.repeat', 'inside', 'after'),
  step('inside', 'inside2'),
  step('inside2'),
  step('after'),
  step('stray'),
]);

const forked = automation([
  start('fork'),
  together('fork', [
    { name: 'left', to: 'l1' },
    { name: 'right', to: 'r1' },
  ]),
  step('l1', 'meet'),
  step('r1', 'meet'),
  join('meet', 'end'),
  stop('end'),
  value('reading'),
]);

describe('connect and disconnect', () => {
  it('connects an unwired exit and replaces an existing wire', () => {
    const done = ok(chain(), [{ op: 'connect', from: 'a', port: 'next', to: 'c' }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(toOf(done.program, 'a', 'next')).toBe('c');
    expect(done.problems.map((problem) => problem.key)).toEqual(['b']);
  });

  it('connects a row exit by its port id', () => {
    const program = automation([start('d'), ifNode('d', [{ name: 'x' }]), step('y')]);
    const rowId = program.nodes[1]?.branches?.[0]?.id ?? '';
    const done = ok(program, [
      { op: 'connect', from: 'd', port: `row:${rowId}`, to: 'y' },
      { op: 'connect', from: 'start', port: 'next', to: 'd' },
    ]);
    expect(done.program.nodes[1]?.branches?.[0]?.to).toBe('y');
  });

  it('disconnects a wire and refuses to remove one that is not there', () => {
    const done = ok(chain(), [{ op: 'disconnect', from: 'a', port: 'next' }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(toOf(done.program, 'a', 'next')).toBeUndefined();
    expect(done.problems.map((problem) => problem.code)).toContain('never_runs');
    expect(refused(chain(), [{ op: 'disconnect', from: 'c', port: 'next' }]).code).toBe(
      'bad_target',
    );
    expect(refused(chain(), [{ op: 'disconnect', from: 'a', port: 'nope' }]).code).toBe(
      'unknown_port',
    );
  });

  it('undoes connect and disconnect', () => {
    expectUndo(chain(), [{ op: 'connect', from: 'a', port: 'next', to: 'c' }]);
    expectUndo(chain(), [{ op: 'disconnect', from: 'a', port: 'next' }]);
  });

  it('refuses a circle', () => {
    expect(reason(chain(), 'c', 'next', 'a')).toBe('circle');
    expect(reason(chain(), 'b', 'next', 'b')).toBe('circle');
    const result = refused(chain(), [{ op: 'connect', from: 'c', port: 'next', to: 'a' }]);
    expect(result.code).toBe('cannot_connect');
    expect(result.reason).toContain('circle');
  });

  it('refuses a wire into Start', () => {
    expect(reason(chain(), 'a', 'next', 'start')).toBe('into_start');
  });

  it('refuses to cross a region in both directions', () => {
    expect(reason(looped, 'inside2', 'next', 'after')).toBe('across_region');
    expect(reason(looped, 'after', 'next', 'inside')).toBe('across_region');
    const out = canConnect(
      looped,
      { from: 'inside2', port: 'next', to: 'after' },
      STATIC_KIND_LOOKUP,
    );
    expect(out.ok ? '' : out.message).toBe('Steps inside Repeat N times cannot lead outside it.');
    const into = canConnect(
      looped,
      { from: 'after', port: 'next', to: 'inside2' },
      STATIC_KIND_LOOKUP,
    );
    expect(into.ok ? '' : into.message).toBe('Only steps inside Repeat N times can lead here.');
    expect(reason(looped, 'inside2', 'next', 'inside')).toBe('circle');
    expect(reason(looped, 'inside', 'next', 'stray')).toBe('ok');
  });

  it('refuses a wire between the paths of a fork', () => {
    expect(reason(forked, 'l1', 'next', 'r1')).toBe('between_paths');
    expect(reason(forked, 'r1', 'next', 'meet')).toBe('ok');
  });

  it('refuses a wire into a Wait for all from outside a fork', () => {
    const outside = automation([
      start('x'),
      step('x', 'y'),
      step('y'),
      together('fork', [
        { name: 'p', to: 'meet' },
        { name: 'q', to: 'meet' },
      ]),
      join('meet'),
    ]);
    expect(reason(outside, 'y', 'next', 'meet')).toBe('join_mismatch');
  });

  it('refuses a value pin to an exec pin and unknown ends', () => {
    expect(reason(forked, 'reading', 'next', 'end')).toBe('value_to_exec');
    expect(reason(forked, 'l1', 'next', 'reading')).toBe('value_to_exec');
    expect(reason(forked, 'nope', 'next', 'end')).toBe('unknown_key');
    expect(reason(forked, 'l1', 'next', 'nope')).toBe('unknown_key');
    expect(reason(forked, 'l1', 'else', 'end')).toBe('unknown_port');
  });

  it('allows connecting inside one region and a loop body to its first step', () => {
    expect(reason(looped, 'each', 'body', 'inside')).toBe('ok');
    expect(reason(looped, 'inside', 'next', 'inside2')).toBe('ok');
    const done = ok(looped, [{ op: 'connect', from: 'inside2', port: 'next', to: 'stray' }]);
    expectStructured(done.program);
  });

  it('connecting the If it fails exit sets route and keeps the rest of the policy', () => {
    const bare = automation([start('a'), step('a'), step('handler')]);
    const plain = ok(bare, [{ op: 'connect', from: 'a', port: 'onError', to: 'handler' }]);
    expect(toOf(plain.program, 'a', 'onError')).toBe('handler');
    expect(nodeAt(plain.program, 'a').policy).toEqual({ onError: 'route' });
    const tuned = automation([
      start('a'),
      step('a', undefined, {
        policy: { onError: 'continue', timeout: 4000, mode: 'wait_for_result' },
      }),
      step('handler'),
    ]);
    const done = ok(tuned, [{ op: 'connect', from: 'a', port: 'onError', to: 'handler' }]);
    expect(nodeAt(done.program, 'a').policy).toEqual({
      onError: 'route',
      timeout: 4000,
      mode: 'wait_for_result',
    });
    expectStructured(done.program);
  });

  it('disconnecting the If it fails exit drops the route and keeps the rest of the policy', () => {
    const wired = automation([
      start('a'),
      step('a', undefined, {
        to: { onError: 'handler' },
        policy: { onError: 'route', timeout: 4000 },
      }),
      step('handler'),
    ]);
    const done = ok(wired, [{ op: 'disconnect', from: 'a', port: 'onError' }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(toOf(done.program, 'a', 'onError')).toBeUndefined();
    expect(nodeAt(done.program, 'a').policy).toEqual({ timeout: 4000 });
    const alone = automation([
      start('a'),
      step('a', undefined, { to: { onError: 'handler' }, policy: { onError: 'route' } }),
      step('handler'),
    ]);
    const cleared = ok(alone, [{ op: 'disconnect', from: 'a', port: 'onError' }], {
      kinds: STATIC_KIND_LOOKUP,
      allowProblems: true,
    });
    expect(nodeAt(cleared.program, 'a').policy).toBeUndefined();
    expect(nodeAt(cleared.program, 'a').to).toBeUndefined();
  });

  it('undoes the If it fails exit connect and disconnect with the previous policy', () => {
    const policies = [undefined, { onError: 'continue' as const, timeout: 900 }];
    for (const policy of policies) {
      const extra = policy === undefined ? {} : { policy };
      const loose = automation([
        start('a'),
        step('a', undefined, extra),
        step('handler'),
        step('other'),
      ]);
      expectUndo(loose, [{ op: 'connect', from: 'a', port: 'onError', to: 'handler' }]);
      const wired = automation([
        start('a'),
        step('a', undefined, {
          to: { onError: 'handler' },
          policy: { onError: 'route', ...policy },
        }),
        step('handler'),
        step('other'),
      ]);
      expectUndo(wired, [{ op: 'connect', from: 'a', port: 'onError', to: 'other' }]);
      expectUndo(wired, [{ op: 'disconnect', from: 'a', port: 'onError' }]);
    }
  });

  it('refuses the If it fails exit on a step that cannot fail and a missing wire to remove', () => {
    const deciding = automation([start('d'), ifNode('d', [{ name: 'x' }]), step('handler')]);
    expect(
      refused(deciding, [{ op: 'connect', from: 'd', port: 'onError', to: 'handler' }]).code,
    ).toBe('unknown_port');
    const bare = automation([start('a'), step('a'), step('handler')]);
    expect(refused(bare, [{ op: 'disconnect', from: 'a', port: 'onError' }]).code).toBe(
      'bad_target',
    );
    const circle = automation([start('a'), step('a', 'handler'), step('handler')]);
    expect(
      refused(circle, [{ op: 'connect', from: 'handler', port: 'onError', to: 'a' }]).code,
    ).toBe('cannot_connect');
    expect(nodeAt(circle, 'handler').policy).toBeUndefined();
  });
});
