import { NODE_REGISTRY } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PURE_BODIES } from '../../../src/nodes/pure/index';
import { HOME, run } from './support';

const ABSENT_IS_AN_ANSWER = new Set(['logic.compare', 'logic.in']);
const OWNED = /^(logic|math|text|list|object|date|util)\./;

describe('pure evaluator registry', () => {
  const pure = NODE_REGISTRY.kinds.filter((kind) => kind.class === 'pure' && OWNED.test(kind.id));

  it('has an evaluator for every pure kind of these categories', () => {
    expect(pure.length).toBeGreaterThan(40);
    const missing = pure.map((kind) => kind.id).filter((id) => PURE_BODIES[id] === undefined);
    expect(missing).toEqual([]);
  });

  it('has no evaluator for a kind that is not pure', () => {
    const known = new Map(NODE_REGISTRY.kinds.map((kind) => [kind.id, kind.class]));
    const stray = Object.keys(PURE_BODIES).filter((id) => known.get(id) !== 'pure');
    expect(stray).toEqual([]);
  });

  it('fails a missing required port instead of inventing a value', () => {
    for (const kind of pure) {
      const needed = kind.inputs.filter((port) => port.required);
      if (needed.length === 0 || ABSENT_IS_AN_ANSWER.has(kind.id)) continue;
      const result = run(kind.id, {}, HOME);
      expect(result.ok, kind.id).toBe(false);
    }
  });
});
