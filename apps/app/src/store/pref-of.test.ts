import { describe, expect, it } from 'vitest';
import { PREFS, prefOf, prefValueOf, storedPrefOf } from './prefs';
import { emptyState, type StoreState } from './state';

const RIGHT = PREFS.appearance.scope === 'client' ? 'client' : null;

const WRONG = PREFS.appearance.scope === 'client' ? null : 'client';

function stateWith(clientId: string | null): StoreState {
  const base = emptyState();
  const row = {
    client_id: clientId,
    profile_id: clientId === null ? 'profile' : null,
    page: PREFS.appearance.storageKey,
    layout: PREFS.appearance.encode(PREFS.appearance.defaultValue),
    updated_at: '2026-10-16T00:00:00.000Z',
  };
  return {
    ...base,
    tables: {
      ...base.tables,
      layouts: { ...base.tables.layouts, byId: { [row.page]: row } },
    },
  };
}

describe('prefOf', () => {
  it('reads the default when nothing is stored', () => {
    expect(prefOf(emptyState(), PREFS.appearance).status).toBe('absent');
    expect(prefValueOf(emptyState(), PREFS.appearance)).toEqual(PREFS.appearance.defaultValue);
  });

  it('reads a row saved with the preference scope', () => {
    expect(prefOf(stateWith(RIGHT), PREFS.appearance).status).toBe('stored');
  });

  it('reports a row saved with the wrong scope as invalid, exactly as the hook does', () => {
    const state = stateWith(WRONG);
    const row = state.tables.layouts.byId[PREFS.appearance.storageKey] ?? null;
    expect(prefOf(state, PREFS.appearance)).toEqual(storedPrefOf(PREFS.appearance, row));
    expect(prefOf(state, PREFS.appearance).status).toBe('invalid');
  });

  it('falls back to the default value when the row is invalid', () => {
    expect(prefValueOf(stateWith(WRONG), PREFS.appearance)).toEqual(PREFS.appearance.defaultValue);
  });
});
