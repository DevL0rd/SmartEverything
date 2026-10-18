import { describe, expect, it } from 'vitest';
import type { BoardWidget } from '@smarteverything/domain';
import type { WidgetDefinition } from '../types';
import {
  addable,
  added,
  isShown,
  moved,
  placeableSize,
  removed,
  resized,
  shifted,
  sizeOptions,
  steppedSize,
  withOptions,
} from './edit-model';

function definition(
  type: string,
  change: Partial<Pick<WidgetDefinition, 'sizes' | 'defaultSize' | 'aspect'>> = {},
): WidgetDefinition {
  return {
    type,
    title: type,
    icon: 'sun',
    sizes: {
      compact: ['M', 'W', 'XL'],
      medium: ['M', 'W', 'XL'],
      expanded: ['M', 'W', 'XL'],
    },
    defaultSize: 'M',
    render: () => null,
    ...change,
  };
}

function board(...keys: string[]): BoardWidget[] {
  return keys.map((key) => ({ key, type: key.split(':')[0] ?? key, size: 'M' }));
}

function keysOf(widgets: readonly BoardWidget[]): string[] {
  return widgets.map((widget) => widget.key);
}

describe('sizeOptions', () => {
  it('lists the allowed sizes by area and leaves out a size with the same shape as an earlier one', () => {
    const options = sizeOptions(definition('t'), 'compact');
    expect(options.map((option) => option.size)).toEqual(['M', 'XL']);
  });

  it('lists only the sizes the board allows', () => {
    const only = definition('t', {
      sizes: { compact: ['M'], medium: ['M', 'XL'], expanded: [] },
    });
    expect(sizeOptions(only, 'compact').map((option) => option.size)).toEqual(['M']);
    expect(sizeOptions(only, 'medium').map((option) => option.size)).toEqual(['M', 'XL']);
    expect(sizeOptions(only, 'expanded')).toEqual([]);
  });

  it('takes the rows from the aspect ratio, which merges sizes that end up the same shape', () => {
    const cell = { width: 100, height: 50, gap: 10, pad: 8 };
    const options = sizeOptions(definition('t', { aspect: 2 }), 'compact', cell);
    expect(options.find((option) => option.size === 'M')).toMatchObject({ columns: 4, rows: 4 });
    expect(options.map((option) => option.size)).toEqual(['M']);
  });
});

describe('steppedSize', () => {
  it('steps to the next larger and the next smaller size', () => {
    const t = definition('t');
    expect(steppedSize(t, 'compact', 'M', 1)).toBe('XL');
    expect(steppedSize(t, 'compact', 'XL', -1)).toBe('M');
  });

  it('stops at the smallest and the largest', () => {
    const t = definition('t');
    expect(steppedSize(t, 'compact', 'M', -1)).toBeNull();
    expect(steppedSize(t, 'compact', 'XL', 1)).toBeNull();
  });

  it('has no step from a size the widget does not offer', () => {
    const t = definition('t', { sizes: { compact: ['M'], medium: ['M'], expanded: ['M'] } });
    expect(steppedSize(t, 'compact', 'XL', 1)).toBeNull();
  });
});

describe('placeableSize', () => {
  it('uses the default size when the board allows it, else the first allowed, else none', () => {
    const t = definition('t', { sizes: { compact: ['W', 'XL'], medium: ['M'], expanded: [] } });
    expect(placeableSize(t, 'medium')).toBe('M');
    expect(placeableSize(t, 'compact')).toBe('W');
    expect(placeableSize(t, 'expanded')).toBeNull();
  });
});

describe('moved', () => {
  it('drops a widget after a later target and before an earlier one', () => {
    expect(keysOf(moved(board('a', 'b', 'c', 'd'), 'a', 'c'))).toEqual(['b', 'c', 'a', 'd']);
    expect(keysOf(moved(board('a', 'b', 'c', 'd'), 'd', 'b'))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves a widget to the end without a target', () => {
    expect(keysOf(moved(board('a', 'b', 'c'), 'a', null))).toEqual(['b', 'c', 'a']);
  });

  it('changes nothing for itself, an unknown widget or a target already in place', () => {
    const widgets = board('a', 'b', 'c');
    expect(moved(widgets, 'a', 'a')).toBe(widgets);
    expect(moved(widgets, 'zzz', 'a')).toBe(widgets);
    expect(keysOf(moved(widgets, 'a', 'b'))).toEqual(['b', 'a', 'c']);
  });
});

describe('shifted', () => {
  it('swaps with the neighbour that is shown, skipping widgets that are hidden', () => {
    const widgets = board('a', 'hidden', 'b', 'c');
    expect(keysOf(shifted(widgets, ['a', 'b', 'c'], 'a', 1))).toEqual(['hidden', 'b', 'a', 'c']);
    expect(keysOf(shifted(widgets, ['a', 'b', 'c'], 'c', -1))).toEqual(['a', 'hidden', 'c', 'b']);
  });

  it('does not move past the first or last shown widget or an unknown one', () => {
    const widgets = board('a', 'b');
    expect(shifted(widgets, ['a', 'b'], 'a', -1)).toBe(widgets);
    expect(shifted(widgets, ['a', 'b'], 'b', 1)).toBe(widgets);
    expect(shifted(widgets, ['a', 'b'], 'zzz', 1)).toBe(widgets);
  });
});

describe('plain edits', () => {
  it('resizes, removes and sets options on one widget only', () => {
    const widgets = board('a', 'b');
    expect(resized(widgets, 'b', 'XL').map((widget) => widget.size)).toEqual(['M', 'XL']);
    expect(keysOf(removed(widgets, 'a'))).toEqual(['b']);
    const withRoom = withOptions(widgets, 'a', { room: 'kitchen' });
    expect(withRoom[0]?.options).toEqual({ room: 'kitchen' });
    expect(withRoom[1]?.options).toBeUndefined();
  });

  it('adds a widget at the end under its type, numbering a repeat from two', () => {
    let widgets: readonly BoardWidget[] = [];
    widgets = added(widgets, 'light', 'M');
    widgets = added(widgets, 'light', 'M', { id: '1' });
    widgets = added(widgets, 'light', 'W');
    expect(keysOf(widgets)).toEqual(['light', 'light:2', 'light:3']);
    expect(widgets[1]?.options).toEqual({ id: '1' });
    expect(widgets[0]).not.toHaveProperty('options');
  });

  it('reuses the lowest free number after a widget was removed', () => {
    const widgets = added(board('light', 'light:3'), 'light', 'M');
    expect(keysOf(widgets)).toEqual(['light', 'light:3', 'light:2']);
  });
});

describe('availability', () => {
  const types = new Set(['a', 'b']);

  it('shows a widget whose type is available and whose instance passes the check', () => {
    const widget: BoardWidget = { key: 'a', type: 'a', size: 'M' };
    expect(isShown(widget, { types, instance: undefined })).toBe(true);
    expect(isShown({ ...widget, type: 'z' }, { types, instance: undefined })).toBe(false);
    expect(isShown(widget, { types, instance: () => false })).toBe(false);
  });

  it('offers the widgets of the catalogue that can be placed and are available', () => {
    const catalogue = [
      definition('a'),
      definition('b', { sizes: { compact: [], medium: ['M'], expanded: ['M'] } }),
      definition('c'),
    ];
    const offered = addable(catalogue, { types, instance: undefined }, 'compact');
    expect(offered.map((item) => item.type)).toEqual(['a']);
  });
});
