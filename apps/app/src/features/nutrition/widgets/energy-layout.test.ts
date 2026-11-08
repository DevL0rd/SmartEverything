import { describe, expect, it } from 'vitest';
import { energyLayoutOf, energyWellOf } from './energy-layout';

describe('energyLayoutOf', () => {
  it('shows only the dial in a tile', () => {
    expect(energyLayoutOf('s')).toBe('dial');
  });

  it('spreads the facts in a strip across a wide frame', () => {
    expect(energyLayoutOf('w')).toBe('strip');
  });

  it('lists the facts in rows beside the dial in medium frames', () => {
    expect(energyLayoutOf('m')).toBe('rows');
    expect(energyLayoutOf('xs')).toBe('rows');
  });
});

describe('energyWellOf', () => {
  it('keeps the largest well when two facts fit the touch body', () => {
    expect(energyWellOf(87.33, 2, 'touch')).toBe('size-7');
  });

  it('shrinks the wells so three facts fit the touch medium body', () => {
    expect(energyWellOf(87.33, 3, 'touch')).toBe('size-6');
  });

  it('shrinks the wells further so three facts fit the pointer medium body', () => {
    expect(energyWellOf(75.33, 3, 'pointer')).toBe('size-5');
  });
});
