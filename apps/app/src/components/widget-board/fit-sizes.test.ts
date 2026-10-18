import { describe, expect, it } from 'vitest';
import { allSizes } from './all-sizes';
import { fittedWidgets } from './fit-sizes';
import type { BoardWidget, WidgetDefinition, WidgetSize } from './types';

function definition(type: string, ...sizes: WidgetSize[]): WidgetDefinition {
  return {
    type,
    title: type,
    icon: 'bulb',
    sizes: allSizes(...sizes),
    defaultSize: sizes[0] ?? 'M',
    render: () => null,
  };
}

const CATALOGUE = [definition('wide', 'M', 'W'), definition('tall', 'XL'), definition('any', 'M')];

function widget(type: string, size: WidgetSize): BoardWidget {
  return { key: type, type, size };
}

describe('fitting stored sizes to what a widget offers', () => {
  it('keeps a size the widget offers as the same object', () => {
    const kept = widget('wide', 'W');
    expect(fittedWidgets([kept], CATALOGUE, 'compact')[0]).toBe(kept);
  });

  it('moves an extra large widget that has no extra large to wide', () => {
    expect(fittedWidgets([widget('wide', 'XL')], CATALOGUE, 'medium')[0]?.size).toBe('W');
  });

  it('moves a medium widget that only has extra large to extra large', () => {
    expect(fittedWidgets([widget('tall', 'M')], CATALOGUE, 'expanded')[0]?.size).toBe('XL');
  });

  it('keeps the order and leaves unknown types alone', () => {
    const list = [widget('any', 'XL'), widget('ghost', 'XL'), widget('wide', 'M')];
    expect(fittedWidgets(list, CATALOGUE, 'compact').map((entry) => entry.size)).toEqual([
      'M',
      'XL',
      'M',
    ]);
  });
});
