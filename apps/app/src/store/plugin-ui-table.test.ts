import { describe, expect, it } from 'vitest';
import type { RowChange } from '@smarteverything/domain';
import { uiRowFixture } from '../plugins/declared/ui-fixture';
import { applyChange } from './live-reducers';
import { emptyState } from './state';

function change(operation: 'INSERT' | 'DELETE'): RowChange {
  const row = uiRowFixture();
  return {
    type: 'change',
    table: 'plugin_ui',
    operation,
    record: operation === 'DELETE' ? null : row,
    oldRecord: operation === 'DELETE' ? row : null,
  };
}

describe('the plugin_ui table of the store', () => {
  it('holds the layout of a plugin that was switched on and drops it when it is switched off', () => {
    const on = applyChange(emptyState(), change('INSERT'));
    expect(on.tables.plugin_ui.byId['garden']?.pages.map((page) => page.id)).toStrictEqual([
      'overview',
    ]);
    const off = applyChange(on, change('DELETE'));
    expect(off.tables.plugin_ui.ids).toStrictEqual([]);
  });

  it('keeps the owner-only plugins table out of what a member receives', () => {
    const on = applyChange(emptyState(), change('INSERT'));
    expect(on.tables.plugins.ids).toStrictEqual([]);
  });
});
