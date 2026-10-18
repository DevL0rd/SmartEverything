import { describe, expect, it } from 'vitest';
import { cycleEffort } from './engine-efforts';

const EFFORTS = ['low', 'medium', 'high'];

describe('cycling the thinking level', () => {
  it('steps through Default and the levels, wrapping round', () => {
    expect(cycleEffort(EFFORTS, null, 1, true)).toBe('low');
    expect(cycleEffort(EFFORTS, 'high', 1, true)).toBeNull();
    expect(cycleEffort(EFFORTS, null, -1, true)).toBe('high');
  });

  it('stops at the ends when told not to wrap', () => {
    expect(cycleEffort(EFFORTS, 'high', 1, false)).toBe('high');
    expect(cycleEffort(EFFORTS, null, -1, false)).toBeNull();
  });

  it('starts from Default when the current level is not offered', () => {
    expect(cycleEffort(EFFORTS, 'max', 1, true)).toBe('low');
  });
});
