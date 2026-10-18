import { describe, expect, it } from 'vitest';
import { stripKeyTarget, stripLayout, type ColourStripSwatch } from './colour-strip-model';

const swatch = (id: string): ColourStripSwatch => ({ id, label: id, colour: '#fff' });
const SIX = ['a', 'b', 'c', 'd', 'e', 'f'].map(swatch);

describe('strip layout', () => {
  it('keeps every preset in its own position whichever one matches', () => {
    for (const id of [null, 'a', 'd', 'f']) {
      const layout = stripLayout(SIX, id, true, 'full');
      expect(layout.presets.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    }
    const layout = stripLayout(SIX, 'd', true, 'full');
    expect(layout.pinnedCurrent).toBe(false);
  });

  it('pins a separate current swatch only when no preset matches', () => {
    expect(stripLayout(SIX, null, true, 'full').pinnedCurrent).toBe(true);
    expect(stripLayout(SIX, null, false, 'full').pinnedCurrent).toBe(false);
  });

  it('drops a repeated preset so the current colour is never shown twice', () => {
    const layout = stripLayout([...SIX, swatch('a')], 'a', true, 'full');
    expect(layout.presets.filter((entry) => entry.id === 'a')).toHaveLength(1);
  });

  it('shows the first five in place when compact density cuts the list and the match is among them', () => {
    expect(stripLayout(SIX, 'c', true, 'compact').presets.map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(stripLayout(SIX, null, true, 'compact').presets.map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('slides the compact window in order only as far as needed to reveal the match', () => {
    const layout = stripLayout(SIX, 'f', true, 'compact');
    expect(layout.presets.map((entry) => entry.id)).toEqual(['b', 'c', 'd', 'e', 'f']);
    expect(layout.pinnedCurrent).toBe(false);
  });
});

describe('strip keys', () => {
  it('moves one swatch with the arrows and stops at both ends', () => {
    expect(stripKeyTarget('ArrowRight', 1, 4)).toBe(2);
    expect(stripKeyTarget('ArrowDown', 3, 4)).toBe(3);
    expect(stripKeyTarget('ArrowLeft', 0, 4)).toBe(0);
    expect(stripKeyTarget('ArrowUp', 2, 4)).toBe(1);
  });

  it('jumps to the first and last swatch on Home and End and ignores other keys', () => {
    expect(stripKeyTarget('Home', 2, 4)).toBe(0);
    expect(stripKeyTarget('End', 0, 4)).toBe(3);
    expect(stripKeyTarget('a', 0, 4)).toBeNull();
    expect(stripKeyTarget('End', 0, 0)).toBeNull();
  });
});
