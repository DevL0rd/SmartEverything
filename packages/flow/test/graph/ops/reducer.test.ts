import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PATCH_OPS } from '../../../src/graph/ops/schema';
import { applyPatch } from '../../../src/graph/ops/reducer';
import { structureProgram } from '../../../src/graph/structure';
import { chain, nodeAt, ok, refused, toOf } from './support';

describe('reducer', () => {
  it('applies operations in order against the result of the previous one', () => {
    const done = ok(chain(), [
      { op: 'add', node: { kind: 'device.set', key: 'extra' }, after: { key: 'b', port: 'next' } },
      { op: 'set', key: 'extra', label: 'Extra' },
      { op: 'rename', key: 'extra', to: 'bonus' },
    ]);
    expect(nodeAt(done.program, 'bonus').label).toBe('Extra');
    expect(toOf(done.program, 'b', 'next')).toBe('bonus');
    expect(structureProgram(done.program, STATIC_KIND_LOOKUP).ok).toBe(true);
  });

  it('is atomic: a refusal part way leaves the program unchanged and names the operation', () => {
    const program = chain();
    const copy = structuredClone(program);
    const result = refused(program, [
      { op: 'add', node: { kind: 'device.set', key: 'extra' } },
      { op: 'connect', from: 'c', port: 'next', to: 'a' },
    ]);
    expect(result).toMatchObject({ code: 'cannot_connect', opIndex: 1 });
    expect(program).toEqual(copy);
  });

  it('does not mutate its input on success', () => {
    const program = chain();
    const copy = structuredClone(program);
    ok(program, [{ op: 'remove', key: 'b', heal: true }]);
    expect(program).toEqual(copy);
  });

  it('returns an invalid result as a refusal with problems that name keys and ports', () => {
    const result = refused(chain(), [{ op: 'disconnect', from: 'a', port: 'next' }]);
    expect(result.code).toBe('invalid_result');
    expect(result.opIndex).toBeUndefined();
    expect(result.problems).toEqual([
      expect.objectContaining({ source: 'structure', code: 'never_runs', key: 'b' }),
      expect.objectContaining({ source: 'structure', code: 'never_runs', key: 'c' }),
    ]);
    expect(result.reason).toContain('never runs');
  });

  it('reports rule problems with the key and the port of the bad wire', () => {
    const result = refused(chain(), [
      { op: 'set', key: 'a', policy: { onError: 'route' } },
      { op: 'add', node: { kind: 'device.set', key: 'bad', to: { elsewhere: 'c' } } },
    ]);
    expect(
      result.problems.map((problem) => [problem.source, problem.code, problem.key, problem.port]),
    ).toContainEqual(['rules', 'undeclared_port', 'bad', 'elsewhere']);
  });

  it('returns structure problems with the result when asked to tolerate them', () => {
    const done = ok(chain(), [{ op: 'disconnect', from: 'a', port: 'next' }], {
      kinds: STATIC_KIND_LOOKUP,
      newId: () => crypto.randomUUID(),
      allowProblems: true,
    });
    expect(done.problems.map((problem) => problem.key)).toEqual(['b', 'c']);
    const rules = refused(chain(), [{ op: 'add', node: { kind: 'flow.start', key: 'second' } }], {
      kinds: STATIC_KIND_LOOKUP,
      newId: () => crypto.randomUUID(),
      allowProblems: true,
    });
    expect(rules.problems.map((problem) => problem.code)).toContain('start_count');
  });

  it('uses random ids when none are supplied and rejects a bad operation shape', () => {
    const done = applyPatch(chain(), [{ op: 'add', node: { kind: 'device.set' } }], {
      kinds: STATIC_KIND_LOOKUP,
      newId: () => crypto.randomUUID(),
      allowProblems: true,
    });
    expect(done.ok && done.created[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(PATCH_OPS.safeParse([{ op: 'move', key: 'a' }]).success).toBe(false);
    expect(PATCH_OPS.safeParse([{ op: 'unwrap', key: 'a' }]).success).toBe(false);
    expect(
      PATCH_OPS.safeParse([
        { op: 'connect', from: 'a', port: 'next', to: 'b' },
        { op: 'header', description: 'x' },
      ]).success,
    ).toBe(true);
  });
});
