import { describe, expect, it } from 'vitest';
import { PATCH_OP, PATCH_OPS, isTarget } from '../../src/ops/schema';

const id = '00000000-0000-4000-8000-000000000001';

describe('isTarget', () => {
  it('accepts triggers and scope paths only', () => {
    for (const text of ['triggers', 'body', 'onFailure', 'rep.body', `if1.branch:${id}`]) {
      expect(isTarget(text)).toBe(true);
    }
    for (const text of ['', 'nowhere', 'a b', 'Body.x']) expect(isTarget(text)).toBe(false);
  });
});

describe('PATCH_OP', () => {
  it('accepts every operation shape', () => {
    const ops = [
      { op: 'add', node: { kind: 'notify.feed' }, in: 'body', after: 'a' },
      { op: 'set', key: 'a', ports: { x: { lit: 1 } }, label: null, enabled: false },
      { op: 'unset', key: 'a', ports: ['x'] },
      { op: 'move', key: 'a', in: 'triggers', index: 0 },
      { op: 'remove', key: 'a', cascade: true },
      { op: 'wrap', keys: ['a', 'b'], kind: 'flow.repeat' },
      { op: 'unwrap', key: 'a' },
      { op: 'rename', key: 'a', to: 'b' },
      { op: 'row', key: 'a', edit: { row: 'case', t: 'move', id, to: 0 } },
      { op: 'header', description: null },
    ];
    for (const op of ops) expect(PATCH_OP.safeParse(op).success).toBe(true);
    expect(PATCH_OPS.safeParse(ops).success).toBe(true);
  });

  it('refuses several placements, an empty header, an empty list and bad targets', () => {
    expect(
      PATCH_OP.safeParse({ op: 'add', node: { kind: 'a.b' }, in: 'body', after: 'a', index: 1 })
        .success,
    ).toBe(false);
    expect(
      PATCH_OP.safeParse({ op: 'move', key: 'a', in: 'body', before: 'b', after: 'c' }).success,
    ).toBe(false);
    expect(PATCH_OP.safeParse({ op: 'header' }).success).toBe(false);
    expect(PATCH_OP.safeParse({ op: 'wrap', keys: [], kind: 'flow.repeat' }).success).toBe(false);
    expect(PATCH_OP.safeParse({ op: 'move', key: 'a', in: 'nowhere' }).success).toBe(false);
    expect(PATCH_OP.safeParse({ op: 'explode', key: 'a' }).success).toBe(false);
    expect(PATCH_OPS.safeParse([]).success).toBe(false);
  });

  it('parses switch cases and try catches with optional ids', () => {
    const parsed = PATCH_OP.safeParse({
      op: 'add',
      in: 'body',
      node: {
        kind: 'flow.switch',
        cases: [{ match: { eq: 1 }, scope: { nodes: [] } }],
        catches: [{ classes: ['Timeout'], scope: { nodes: [{ kind: 'notify.feed' }] } }],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('parses a nested node with optional ids', () => {
    const parsed = PATCH_OP.safeParse({
      op: 'add',
      in: 'body',
      node: {
        kind: 'flow.if',
        branches: [{ when: { lit: true }, scope: { nodes: [{ kind: 'notify.feed' }] } }],
        scopes: { else: { nodes: [] } },
      },
    });
    expect(parsed.success).toBe(true);
  });
});
