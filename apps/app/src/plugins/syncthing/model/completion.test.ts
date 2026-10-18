import { describe, expect, it } from 'vitest';
import { percentOf, overallCompletion, ringShare } from './completion';
import { folderOf } from './snapshot-fixture';

describe('overallCompletion', () => {
  it('has no answer without folders', () => {
    expect(overallCompletion([])).toBeNull();
  });

  it('is complete when no folder has anything left', () => {
    expect(overallCompletion([folderOf(), folderOf({ id: 'docs' })])).toBe(1);
  });

  it('sizes each folder from what is left and how far it got', () => {
    const half = folderOf({ completionPercent: 50, needBytes: 100 });
    expect(overallCompletion([half, folderOf({ id: 'docs' })])).toBe(0.5);
  });

  it('weights bigger folders more', () => {
    const big = folderOf({ id: 'big', completionPercent: 50, needBytes: 1000 });
    const small = folderOf({ id: 'small', completionPercent: 90, needBytes: 10 });
    const share = overallCompletion([big, small]);
    expect(share).toBeCloseTo(1 - 1010 / 2100, 5);
    expect(share).toBeLessThan(0.6);
  });
});

describe('percentOf', () => {
  it('never shows 100 while bytes are left', () => {
    expect(percentOf(folderOf({ completionPercent: 99.7, needBytes: 5 }))).toBe(99);
    expect(percentOf(folderOf({ completionPercent: 100, needBytes: 5 }))).toBe(99);
  });

  it('shows 100 only with nothing left', () => {
    expect(percentOf(folderOf())).toBe(100);
  });
});

describe('ringShare', () => {
  it('keeps a visible gap from 95 percent up to but not including 100', () => {
    expect(ringShare(94)).toBe(0.94);
    expect(ringShare(95)).toBe(0.94);
    expect(ringShare(99)).toBe(0.94);
  });

  it('closes the ring at 100 percent only', () => {
    expect(ringShare(100)).toBe(1);
    expect(ringShare(62)).toBe(0.62);
  });
});
