import { describe, expect, it, vi } from 'vitest';
import { emptyState, rowsOf, type StoreState } from './state';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '4.2.0' } } }));

const { slotsOf } = await import('./persistence-slots');

function withoutTable(state: StoreState, name: string): StoreState {
  const tables: Record<string, unknown> = { ...state.tables };
  delete tables[name];
  return { ...state, tables: tables as StoreState['tables'] };
}

describe('a table the store does not hold yet', () => {
  it('writes an empty list instead of crashing the snapshot writer', () => {
    const state = withoutTable(emptyState(), 'drive_roots');
    const slot = slotsOf('https://hub.test').find((item) => item.key.endsWith('.t.drive_roots'));
    expect(slot).toBeDefined();
    expect(slot?.text(state, 1)).toBe('[]');
  });

  it('reads as no rows instead of crashing the screen', () => {
    const state = withoutTable(emptyState(), 'drive_albums');
    expect(rowsOf(state.tables.drive_albums)).toEqual([]);
  });
});
