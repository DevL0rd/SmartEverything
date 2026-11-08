import { describe, expect, it } from 'vitest';
import { dayCapacity, statCapacity, statColumns, statHeight } from './fit-math';

describe('statHeight', () => {
  it('is the icon well when the text is shorter', () => {
    expect(statHeight('pointer', false)).toBe(36);
  });

  it('adds the caption line for captioned stats', () => {
    expect(statHeight('touch', false)).toBe(40);
    expect(statHeight('touch', true)).toBe(56);
    expect(statHeight('pointer', true)).toBe(50);
  });
});

describe('statColumns', () => {
  it('fits whole stat columns into the measured width', () => {
    expect(statColumns(0)).toBe(0);
    expect(statColumns(143)).toBe(0);
    expect(statColumns(144)).toBe(1);
    expect(statColumns(300)).toBe(2);
    expect(statColumns(520)).toBe(3);
  });
});

describe('statCapacity', () => {
  it('shows one row of stats beside the medium hero', () => {
    expect(statCapacity({ width: 300, height: 87 }, 'touch', false)).toBe(2);
    expect(statCapacity({ width: 300, height: 75 }, 'pointer', false)).toBe(2);
  });

  it('shows nothing before the first layout', () => {
    expect(statCapacity({ width: 0, height: 0 }, 'touch', true)).toBe(0);
  });

  it('fills the rows left under the extra large hero', () => {
    expect(statCapacity({ width: 520, height: 71 }, 'pointer', true)).toBe(3);
    expect(statCapacity({ width: 330, height: 140 }, 'touch', true)).toBe(4);
  });

  it('shows no stat when a row does not fit', () => {
    expect(statCapacity({ width: 300, height: 30 }, 'touch', false)).toBe(0);
  });
});

describe('dayCapacity', () => {
  it('fits whole forecast days into the measured height', () => {
    expect(dayCapacity(0)).toBe(0);
    expect(dayCapacity(39)).toBe(0);
    expect(dayCapacity(40)).toBe(1);
    expect(dayCapacity(153)).toBe(3);
    expect(dayCapacity(167)).toBe(4);
  });
});
