import { describe, expect, it } from 'vitest';
import { harnessContextPercent } from '../src/ai-harness-session';

const measured = {
  capacity_tokens: 1_000_000,
  input_tokens: 540_000,
  state: 'measured',
} as const;

describe('how full a native conversation is', () => {
  it('is unknown without a measured context, window or request size', () => {
    expect(harnessContextPercent(undefined)).toBeNull();
    expect(harnessContextPercent({ ...measured, capacity_tokens: null })).toBeNull();
    expect(harnessContextPercent({ ...measured, input_tokens: null })).toBeNull();
  });

  it('is the last request size over the window', () => {
    expect(harnessContextPercent(measured)).toBe(54);
  });

  it('never passes 100 percent', () => {
    expect(harnessContextPercent({ ...measured, input_tokens: 2_000_000 })).toBe(100);
  });

  it('uses the estimate after a compaction instead of the larger size measured before it', () => {
    expect(harnessContextPercent({ ...measured, state: 'stale', estimate_tokens: 120_000 })).toBe(
      12,
    );
  });

  it('keeps the measured size while stale without an estimate or while compacting', () => {
    expect(harnessContextPercent({ ...measured, state: 'stale', estimate_tokens: null })).toBe(54);
    expect(harnessContextPercent({ ...measured, state: 'compacting' })).toBe(54);
  });
});
