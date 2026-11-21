import { describe, expect, it } from 'vitest';
import { AUTOMATION_ROW, STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import { EntityStore } from '../../../store/entity-store';
import { applyListChange } from '../../../store/live-reducers';
import { idOf, timed } from '../list/list-fixtures';
import { hubSource } from './source';

const ID = idOf(1);

function storeWithAutomation(): EntityStore {
  const record = AUTOMATION_ROW.parse({
    id: ID,
    name: 'Evening',
    enabled: true,
    revision: 1,
    definition: unstructure(timed(), STATIC_KIND_LOOKUP),
    draft: null,
    layout: { nodes: {}, frames: [], comments: [] },
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  });
  const store = new EntityStore();
  store.update((state) =>
    applyListChange(state, 'automations', {
      table: 'automations',
      operation: 'INSERT',
      record,
      oldRecord: null,
    }),
  );
  return store;
}

function stored(store: EntityStore): { readonly name: string; readonly enabled: boolean } | null {
  const row = store.get().tables.automations.byId[ID];
  return row === undefined ? null : { name: row.name, enabled: row.enabled };
}

describe('automation writes', () => {
  it('shows a switched automation at once and keeps it when the Hub accepts', async () => {
    const store = storeWithAutomation();
    const seen: unknown[] = [];
    await hubSource(store).write({
      event: 'automation.enable',
      automationId: ID,
      change: (row) => ({ ...row, enabled: false }),
      send: () => {
        seen.push(stored(store));
        return Promise.resolve(null);
      },
    });
    expect(seen).toEqual([{ name: 'Evening', enabled: false }]);
    expect(stored(store)).toEqual({ name: 'Evening', enabled: false });
  });

  it('puts the old name back when the Hub refuses a rename', async () => {
    const store = storeWithAutomation();
    await expect(
      hubSource(store).write({
        event: 'automation.rename',
        automationId: ID,
        change: (row) => ({ ...row, name: 'Night' }),
        send: () => Promise.reject(new Error('refused')),
      }),
    ).rejects.toThrow('refused');
    expect(stored(store)).toEqual({ name: 'Evening', enabled: true });
  });

  it('hides a deleted automation at once and brings it back when the delete fails', async () => {
    const store = storeWithAutomation();
    let refuse = (_error: Error): void => {
      throw new Error('Expected a pending delete');
    };
    const removal = hubSource(store).write({
      event: 'automation.remove',
      automationId: ID,
      change: () => null,
      send: () =>
        new Promise<never>((_resolve, reject) => {
          refuse = reject;
        }),
    });
    expect(stored(store)).toBeNull();
    refuse(new Error('still called'));
    await expect(removal).rejects.toThrow('still called');
    expect(stored(store)).toEqual({ name: 'Evening', enabled: true });
  });
});
