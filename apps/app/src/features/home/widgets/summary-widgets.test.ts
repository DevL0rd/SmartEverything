import { describe, expect, it } from 'vitest';

const { fitnessLayout } = await import('./summary-widgets');

const PHONE_M = { width: 380, height: 140, idiom: 'touch' } as const;

const PHONE_XL = { width: 380, height: 324, idiom: 'touch' } as const;

const DESKTOP_W = { width: 700, height: 128, idiom: 'pointer' } as const;

describe('fitness today layout', () => {
  it('keeps the compact glance in a narrow frame', () => {
    expect(fitnessLayout({ frame: { ...PHONE_M, width: 180 }, cls: 's' }, 2)).toBe('compact');
  });

  it('lays figures in columns when every column fits the width', () => {
    expect(fitnessLayout({ frame: PHONE_M, cls: 'm' }, 2)).toBe('columns');
    expect(fitnessLayout({ frame: DESKTOP_W, cls: 'w' }, 4)).toBe('columns');
  });

  it('stacks figures when the rows fit the tier body', () => {
    expect(fitnessLayout({ frame: PHONE_M, cls: 'm' }, 3)).toBe('stacked');
    expect(fitnessLayout({ frame: PHONE_XL, cls: 'l' }, 4)).toBe('stacked');
  });

  it('falls back to compact rows when stacked figures would overflow the tier body', () => {
    expect(fitnessLayout({ frame: PHONE_M, cls: 'm' }, 4)).toBe('compact');
  });
});
