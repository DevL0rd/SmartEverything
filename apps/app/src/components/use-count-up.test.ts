import { describe, expect, it } from 'vitest';
import { countPlan } from './use-count-up';

describe('countPlan', () => {
  it('counts between two numbers, keeping the decimals of the new value', () => {
    expect(countPlan('20', '21.5', true)).toEqual({
      kind: 'tween',
      from: 20,
      to: 21.5,
      decimals: 1,
    });
  });

  it('jumps straight to the value while animation is off', () => {
    expect(countPlan('20', '30', false)).toEqual({ kind: 'jump' });
  });

  it('jumps when either side is not a plain number', () => {
    expect(countPlan('20', '--', true)).toEqual({ kind: 'jump' });
    expect(countPlan('n/a', '20', true)).toEqual({ kind: 'jump' });
  });

  it('jumps when the number did not change', () => {
    expect(countPlan('20.0', '20', true)).toEqual({ kind: 'jump' });
  });

  it('jumps when the change is smaller than the share asked for', () => {
    expect(countPlan('50', '54', true, 0.1)).toEqual({ kind: 'jump' });
    expect(countPlan('50', '55', true, 0.1)).toMatchObject({ kind: 'tween', from: 50, to: 55 });
  });

  it('measures a small previous value against one so near-zero readings still count', () => {
    expect(countPlan('0', '0.05', true, 0.1)).toEqual({ kind: 'jump' });
    expect(countPlan('0', '0.2', true, 0.1)).toMatchObject({ kind: 'tween' });
  });
});
