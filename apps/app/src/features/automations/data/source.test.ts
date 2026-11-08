import { describe, expect, it, vi } from 'vitest';
import { NODE_REGISTRY, type AutomationPluginKindRow } from '@smarteverything/domain';
import { EntityStore } from '../../../store/entity-store';
import { emptyState, makeTable } from '../../../store/state';
import { PING_KIND_ID, kindRow } from '../../../test-support/plugin-kinds';
import { hubSource } from './source';

function withKinds(store: EntityStore, rows: readonly AutomationPluginKindRow[]): void {
  store.update((state) => ({
    ...state,
    tables: {
      ...state.tables,
      automation_plugin_kinds: makeTable(
        Object.fromEntries(rows.map((row) => [row.kind_id, row])),
        rows.map((row) => row.kind_id),
        state.tables.automation_plugin_kinds.version + 1,
      ),
    },
  }));
}

describe('the hub automations source kinds', () => {
  it('is the static registry before any plugin kind arrives', () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    expect(hubSource(store).kindSource.snapshot()).toBe(NODE_REGISTRY);
  });

  it('adds the stored plugin kinds to the static ones and wakes the subscriber', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    const source = hubSource(store);
    const wake = vi.fn();
    const stop = source.kindSource.subscribe(wake);
    withKinds(store, [kindRow()]);
    await vi.waitFor(() => {
      expect(wake).toHaveBeenCalled();
    });
    expect(source.kindSource.snapshot().get(PING_KIND_ID)?.name).toBe('Ping the demo');
    expect(source.kindSource.snapshot().get('device.set')).toBe(NODE_REGISTRY.get('device.set'));
    stop();
  });

  it('keeps a kind that is switched off', () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    withKinds(store, [kindRow('off')]);
    expect(hubSource(store).kindSource.snapshot().has(PING_KIND_ID)).toBe(true);
  });
});
