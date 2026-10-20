import { describe, expect, it } from 'vitest';
import { canonicalPlan, hashPlan } from '../../src/compile/hash';
import type { Plan } from '../../src/compile/plan';
import { PLAN } from '../../src/compile/plan';
import { lit, make, planOf } from './support';

const base = (): Plan =>
  planOf([
    make('a', 'flow.stop', { message: lit('x') }),
    make('w', 'flow.wait', { duration: lit(1) }),
  ]);

describe('plan hash', () => {
  it('is a sha-256 hex digest', () => {
    expect(hashPlan(base())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for the same plan', () => {
    const plan = base();
    expect(hashPlan(plan)).toBe(hashPlan(structuredClone(plan)));
  });

  it('does not depend on the order of keys', () => {
    const plan = base();
    const shuffled = PLAN.parse(
      JSON.parse(
        JSON.stringify(plan, (_key, value: unknown) =>
          value instanceof Object && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).reverse())
            : value,
        ),
      ),
    );
    expect(Object.keys(shuffled)).not.toEqual(Object.keys(plan));
    expect(hashPlan(shuffled)).toBe(hashPlan(plan));
  });

  it('sorts keys at every depth', () => {
    const text = canonicalPlan(base());
    expect(text.startsWith('{"body":{"op":"seq","ops":[{"at":{"id":')).toBe(true);
    expect(text).toContain('"key":"a"}');
    expect(text.endsWith('"version":1}')).toBe(true);
  });

  it('ignores an absent optional field', () => {
    const plan = base();
    expect(hashPlan({ ...plan, onFailure: undefined })).toBe(hashPlan(plan));
  });

  it('changes with the content', () => {
    const plan = base();
    const other = planOf([make('a', 'flow.stop', { message: lit('y') })]);
    expect(hashPlan(other)).not.toBe(hashPlan(plan));
  });

  it('keeps the order of the steps', () => {
    const plan = base();
    if (plan.body.op !== 'seq') throw new Error('not a seq');
    const reversed: Plan = { ...plan, body: { op: 'seq', ops: [...plan.body.ops].reverse() } };
    expect(hashPlan(reversed)).not.toBe(hashPlan(plan));
  });
});
