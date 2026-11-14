import { describe, expect, it, vi } from 'vitest';
import { emptyState } from './state';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '4.2.0' } } }));

const { slotsOf, CACHED_SHARED_LISTS, SHARED_LISTS, OWNER_LISTS } =
  await import('./persistence-slots');

const LIST_SLOT = /\.[to]\.([a-z_]+)$/u;

describe('persisted list slots', () => {
  it('writes every listed table from the tables the store always holds', () => {
    const state = emptyState();
    const listed = slotsOf('https://hub.test').filter((slot) => LIST_SLOT.test(slot.key));
    expect(listed.length).toBe(CACHED_SHARED_LISTS.length + OWNER_LISTS.length);
    for (const slot of listed) {
      expect(slot.text(state, 1), slot.key).toBe('[]');
    }
  });

  it('lists only tables that the store declares', () => {
    const stored = Object.keys(emptyState().tables);
    for (const name of [...SHARED_LISTS, ...OWNER_LISTS]) {
      expect(stored).toContain(name);
    }
  });
});
