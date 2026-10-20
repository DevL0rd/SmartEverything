import { describe, expect, it } from 'vitest';
import { editScope } from '../../src/extract/scope-edit';
import { ExtractRefusal, attempt, refuse } from '../../src/extract/result';
import { BODY_PATH, childPath } from '../../src/program/paths';
import { automation, probe, repeating } from './support';

describe('editScope', () => {
  it('changes a copy of the scope and leaves the program alone', () => {
    const program = automation([probe('a'), repeating('rep', [probe('b')])]);
    const root = editScope(program, BODY_PATH, (nodes) => nodes.slice(0, 1));
    expect(root.body.nodes.map((node) => node.key)).toEqual(['a']);
    expect(program.body.nodes).toHaveLength(2);
    const inner = editScope(program, childPath('rep', { kind: 'scope', name: 'body' }), () => []);
    expect(inner.body.nodes[1]?.scopes?.['body']?.nodes).toEqual([]);
  });

  it('refuses a scope that does not exist', () => {
    const program = automation([probe('a')]);
    expect(() =>
      editScope(program, childPath('ghost', { kind: 'scope', name: 'body' }), (nodes) => nodes),
    ).toThrow(ExtractRefusal);
  });
});

describe('attempt', () => {
  it('turns a refusal into a result and lets other errors through', () => {
    expect(attempt(() => refuse('empty', 'nothing', ['a']))).toEqual({
      ok: false,
      code: 'empty',
      reason: 'nothing',
      suggestion: ['a'],
    });
    expect(attempt(() => 5)).toBe(5);
    expect(() =>
      attempt(() => {
        throw new TypeError('broken');
      }),
    ).toThrow('broken');
  });
});
