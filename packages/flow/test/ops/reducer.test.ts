import { describe, expect, it } from 'vitest';
import { applyPatch } from '../../src/ops/reducer';
import { PATCH_OPS } from '../../src/ops/schema';
import { automation, bodyKeys, node, ok, refused, trigger, withTriggers } from './support';

const base = (): ReturnType<typeof automation> =>
  withTriggers(
    automation([
      node('a', 'notify.feed'),
      node('b', 'notify.feed', { x: { wire: { from: 'a', port: 'ok' } } }),
    ]),
    trigger('press'),
  );

describe('applyPatch', () => {
  it('applies ordered operations and undoes them with one inverse list', () => {
    const program = base();
    const before = structuredClone(program);
    const result = ok(program, [
      { op: 'add', node: { kind: 'notify.feed', key: 'c' }, in: 'body' },
      { op: 'rename', key: 'a', to: 'first' },
      { op: 'set', key: 'c', ports: { p: { wire: { from: 'first', port: 'ok' } } } },
      { op: 'move', key: 'c', in: 'body', index: 0 },
      { op: 'remove', key: 'press' },
    ]);
    expect(program).toEqual(before);
    expect(bodyKeys(result.program)).toEqual(['c', 'first', 'b']);
    const undone = ok(result.program, result.inverse);
    expect(undone.program).toEqual(program);
    expect(ok(undone.program, undone.inverse).program).toEqual(result.program);
  });

  it('refuses the whole batch and names the failing operation', () => {
    const program = base();
    const result = applyPatch(program, [
      { op: 'set', key: 'a', label: 'ok' },
      { op: 'remove', key: 'ghost' },
      { op: 'set', key: 'b', label: 'never' },
    ]);
    expect(result).toMatchObject({ ok: false, code: 'unknown_key', opIndex: 1 });
    expect(program.body.nodes[0]).not.toHaveProperty('label');
  });

  it('refuses a result that is not a valid program', () => {
    const result = applyPatch(base(), [
      { op: 'set', key: 'a', policy: { onError: 'route' } },
      {
        op: 'add',
        in: 'body',
        node: { kind: 'flow.repeat', key: 'rep', scopes: { other: { nodes: [] } } },
      },
    ]);
    expect(result).toMatchObject({ ok: false, code: 'invalid_result', opIndex: undefined });
    expect(result.ok ? '' : result.reason).toContain('body');
  });

  it('refuses a program that was already invalid, even with no operations', () => {
    const broken = {
      ...base(),
      body: { nodes: [node('a', 'notify.feed'), node('a', 'notify.feed')] },
    };
    expect(refused(broken, []).code).toBe('invalid_result');
  });

  it('accepts no operations on a valid program', () => {
    const result = ok(base(), []);
    expect(result.inverse).toEqual([]);
    expect(result.detached).toEqual([]);
  });

  it('collects what cascade detached and what was created', () => {
    const result = ok(base(), [
      { op: 'add', node: { kind: 'notify.feed' }, in: 'body' },
      { op: 'remove', key: 'a', cascade: true },
    ]);
    expect(result.created).toHaveLength(1);
    expect(result.detached).toHaveLength(1);
  });

  it('makes its own ids by default', () => {
    const result = applyPatch(base(), [{ op: 'add', node: { kind: 'notify.feed' }, in: 'body' }]);
    if (!result.ok) throw new Error('refused');
    expect(result.created[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('works from parsed JSON', () => {
    const parsed = PATCH_OPS.parse([{ op: 'set', key: 'a', label: 'Hello' }]);
    expect(ok(base(), parsed).program.body.nodes[0]?.label).toBe('Hello');
  });

  it('lets errors that are not refusals through', () => {
    expect(() =>
      applyPatch(base(), [{ op: 'add', node: { kind: 'notify.feed' }, in: 'body' }], {
        newId: () => {
          throw new Error('boom');
        },
      }),
    ).toThrow('boom');
  });
});
