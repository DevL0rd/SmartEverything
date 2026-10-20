import { describe, expect, it } from 'vitest';
import { wireState } from './edge-state';

const done = { state: 'done' } as const;

describe('wireState', () => {
  it('is idle without a run', () => {
    expect(wireState(null, null)).toBe('idle');
    expect(wireState(done, null)).toBe('idle');
  });

  it('is taken once both ends ran and flowing into a running node', () => {
    expect(wireState(done, { state: 'done' })).toBe('taken');
    expect(wireState(done, { state: 'running' })).toBe('flowing');
  });

  it('is skipped after a skipped source and idle into a skipped target', () => {
    expect(wireState({ state: 'skipped' }, null)).toBe('skipped');
    expect(wireState(done, { state: 'skipped' })).toBe('idle');
  });

  it('is idle while the source still runs', () => {
    expect(wireState({ state: 'running' }, null)).toBe('idle');
  });
});
