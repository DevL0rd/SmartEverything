import { describe, expect, it } from 'vitest';
import { boardClassOf } from '../../../components/widget-board/board-geometry';
import { pack } from '../../../components/widget-board/packer';
import { widthClassOf } from '../../../design/size-class';
import { HOME_WIDGET_SIZES } from './widget-sizes';

describe('home size registry', () => {
  it('offers no small or large square size', () => {
    for (const choice of Object.values(HOME_WIDGET_SIZES)) {
      const offered: readonly string[] = choice.sizes;
      expect(offered).not.toContain('S');
      expect(offered).not.toContain('L');
    }
  });

  it('offers Indoors in medium and wide', () => {
    expect(HOME_WIDGET_SIZES.glance.sizes).toEqual(['M', 'W']);
  });

  it('keeps Weather in every wide size', () => {
    expect(HOME_WIDGET_SIZES.weather.sizes).toEqual(['M', 'W', 'XL']);
  });

  it('keeps Favourites to the size that holds a tile grid', () => {
    expect(HOME_WIDGET_SIZES.favourites.sizes).toEqual(['XL']);
  });

  it('allows Rooms as a strip or a grid', () => {
    expect(HOME_WIDGET_SIZES.rooms.sizes).toEqual(['M', 'W', 'XL']);
  });

  it('defaults every type to a size it offers', () => {
    for (const choice of Object.values(HOME_WIDGET_SIZES)) {
      const offered: readonly string[] = choice.sizes;
      expect(offered).toContain(choice.defaultSize);
    }
  });
});

describe('home tiles by window width', () => {
  const tiles = (['glance', 'weather', 'scenes'] as const).map((type) => ({
    key: type,
    type,
    size: HOME_WIDGET_SIZES[type].defaultSize,
  }));

  it.each([
    [390, 'compact', 1],
    [700, 'medium', 2],
    [1000, 'expanded', 2],
    [1700, 'xlarge', 2],
  ] as const)('lays the default tiles out at %i px (%s) with %i per row', (width, name, count) => {
    expect(widthClassOf(width)).toBe(name);
    const placements = pack(boardClassOf(widthClassOf(width)), tiles);
    expect(placements.filter((placement) => placement.row === 0)).toHaveLength(count);
  });
});
