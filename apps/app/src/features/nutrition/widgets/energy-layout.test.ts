import { describe, expect, it } from 'vitest';
import { energyLayoutOf } from './energy-layout';

describe('energyLayoutOf', () => {
  it('shows only the dial in a tile', () => {
    expect(energyLayoutOf('s', 141)).toBe('dial');
  });

  it('spreads the facts in a strip across a wide frame', () => {
    expect(energyLayoutOf('w', 660)).toBe('strip');
  });

  it('stacks the facts beside the dial when 200 px or more is left', () => {
    expect(energyLayoutOf('m', 326)).toBe('rows');
    expect(energyLayoutOf('xs', 508)).toBe('rows');
  });

  it('stacks labels above values when less than 200 px is left beside the dial', () => {
    expect(energyLayoutOf('m', 290)).toBe('narrow-rows');
  });
});
