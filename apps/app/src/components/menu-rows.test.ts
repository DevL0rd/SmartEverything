import { describe, expect, it } from 'vitest';
import { arrangeEntries, type MenuItem } from './menu-rows';

function item(label: string, change: Partial<MenuItem> = {}): MenuItem {
  return { label, onPress: () => undefined, ...change };
}

function shapeOf(items: readonly MenuItem[]): readonly string[] {
  return arrangeEntries([], items).map((entry) => {
    if (entry.kind === 'item') return entry.item.label;
    return entry.kind === 'heading' ? `# ${entry.label}` : '—';
  });
}

describe('menu entries', () => {
  it('divides sections without a heading and keeps the destructive item apart', () => {
    expect(
      shapeOf([
        item('Open', { section: 'open' }),
        item('Details', { section: 'open' }),
        item('Rename', { section: 'change' }),
        item('Share', { section: 'share' }),
        item('Move to Trash', { section: 'danger', destructive: true }),
      ]),
    ).toEqual(['Open', 'Details', '—', 'Rename', '—', 'Share', '—', 'Move to Trash']);
  });

  it('heads named groups once', () => {
    expect(
      shapeOf([item('A', { group: 'Sort' }), item('B', { group: 'Sort' }), item('C')]),
    ).toEqual(['# Sort', 'A', 'B', '—', 'C']);
  });
});
