import { describe, expect, it } from 'vitest';
import { paletteIndexOf, paletteSlotOf } from './speaker';

describe('paletteSlotOf', () => {
  it('never picks the coral slot and always stays in the chart palette', () => {
    const names = Array.from({ length: 400 }, (_, index) => `participant ${String(index)}`);
    const slots = new Set(names.map(paletteSlotOf));
    expect([...slots].sort()).toEqual([1, 2, 3, 5, 6]);
  });

  it('is stable for one name and keeps its index inside the slot list', () => {
    expect(paletteSlotOf('Nova')).toBe(paletteSlotOf('Nova'));
    expect(paletteIndexOf('Nova')).toBeLessThan(5);
  });
});
