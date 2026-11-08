import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import type { StoreState } from '../../../store/state';
import { rowEdit, writeOptimistically, type RowAccess } from './optimistic';

const access: RowAccess<string> = {
  find: (state) => state.serviceLog[0] ?? null,
  put: (state, row) => ({ ...state, serviceLog: [row] }),
  drop: (state) => ({ ...state, serviceLog: [] }),
};

function storeWith(row: string | null): EntityStore {
  const store = new EntityStore();
  store.update((state: StoreState) => ({ ...state, serviceLog: row === null ? [] : [row] }));
  return store;
}

describe('writeOptimistically', () => {
  it('shows the new row at once and keeps it when the write succeeds', async () => {
    const store = storeWith('old');
    const seen: (string | null)[] = [];
    await writeOptimistically(store, 'planner_item.update', [rowEdit(access, 'old', 'new')], () => {
      seen.push(access.find(store.get()));
      return Promise.resolve('ok');
    });
    expect(seen).toEqual(['new']);
    expect(access.find(store.get())).toBe('new');
  });

  it('puts the previous row back and rethrows when the write fails', async () => {
    const store = storeWith('old');
    await expect(
      writeOptimistically(store, 'planner_item.update', [rowEdit(access, 'old', 'new')], () =>
        Promise.reject(new Error('refused')),
      ),
    ).rejects.toThrow('refused');
    expect(access.find(store.get())).toBe('old');
  });

  it('removes a row that did not exist before when its write fails', async () => {
    const store = storeWith(null);
    await expect(
      writeOptimistically(store, 'planner_item.complete', [rowEdit(access, null, 'done')], () =>
        Promise.reject(new Error('refused')),
      ),
    ).rejects.toThrow('refused');
    expect(access.find(store.get())).toBeNull();
  });

  it('restores a deleted row when the delete fails', async () => {
    const store = storeWith('keep');
    const send = (): Promise<void> => {
      expect(access.find(store.get())).toBeNull();
      return Promise.reject(new Error('refused'));
    };
    await expect(
      writeOptimistically(store, 'planner_item.delete', [rowEdit(access, 'keep', null)], send),
    ).rejects.toThrow('refused');
    expect(access.find(store.get())).toBe('keep');
  });

  it('does not overwrite a row a live change has replaced since', async () => {
    const store = storeWith('old');
    await expect(
      writeOptimistically(store, 'planner_item.update', [rowEdit(access, 'old', 'new')], () => {
        store.update((state) => access.put(state, 'from-the-hub'));
        return Promise.reject(new Error('refused'));
      }),
    ).rejects.toThrow('refused');
    expect(access.find(store.get())).toBe('from-the-hub');
  });

  it('sends without touching the store when nothing is predicted', async () => {
    const store = storeWith('old');
    const before = store.get();
    await writeOptimistically(store, 'planner_item.update', [], () => Promise.resolve(1));
    expect(store.get()).toBe(before);
  });
});
