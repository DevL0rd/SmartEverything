import {
  CLIENT_PREFS,
  SESSION,
  type DeveloperLevel,
  type LayoutRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { emptyState, makeTable, type StoreState } from '../store/state';
import { deviceLevel, levelsUnlocked, personLevel, unlockedIn } from './panel';

const LEVEL = CLIENT_PREFS.developer_level;

const PERSON = '00000000-0000-4000-8000-000000000001';
const CLIENT = '00000000-0000-4000-8000-000000000002';

function layoutOf(level: DeveloperLevel, layer: 'device' | 'person'): LayoutRow {
  return {
    client_id: layer === 'device' ? CLIENT : null,
    profile_id: layer === 'device' ? null : PERSON,
    page: LEVEL.storageKey,
    layout: LEVEL.encode(level),
    updated_at: '2026-11-05T02:00:00.000Z',
  };
}

const SESSION_ROW = SESSION.parse({
  client: {
    id: CLIENT,
    name: 'Phone',
    platform: 'android',
    developer: false,
    role: 'owner',
    built_in: false,
    profile_id: PERSON,
    created_at: '2026-11-05T02:00:00.000Z',
    last_seen_at: null,
  },
  hub: { version: '1.0.0', startedAt: '2026-11-05T02:00:00.000Z', cameras: 'running' },
});

function stateWith(rows: readonly LayoutRow[], signedIn = true): StoreState {
  const state = emptyState();
  if (rows.length === 0) {
    return state;
  }
  const byId = Object.fromEntries(rows.map((row) => [row.page, row]));
  return {
    ...state,
    session: signedIn ? SESSION_ROW : null,
    tables: { ...state.tables, layouts: makeTable(byId, Object.keys(byId), 1) },
  };
}

describe('developer mode', () => {
  it('is off with nothing saved', () => {
    const state = stateWith([]);
    expect(deviceLevel(state)).toBe('off');
    expect(personLevel(state)).toBe('off');
    expect(unlockedIn(state)).toBe(false);
  });

  it('is on for this device after it was switched on here', () => {
    const state = stateWith([layoutOf('on', 'device')]);
    expect(deviceLevel(state)).toBe('on');
    expect(personLevel(state)).toBe('off');
    expect(unlockedIn(state)).toBe(true);
  });

  it('is on for every device of the person after the person switch', () => {
    const state = stateWith([layoutOf('on', 'person')]);
    expect(deviceLevel(state)).toBe('off');
    expect(personLevel(state)).toBe('on');
    expect(unlockedIn(state)).toBe(true);
    expect(stateWith([layoutOf('on', 'person')], false).session).toBeNull();
    expect(personLevel(stateWith([layoutOf('on', 'person')], false))).toBe('off');
  });

  it('ignores a saved value it cannot read', () => {
    const state = stateWith([layoutOf('on', 'device')]);
    const broken: StoreState = {
      ...state,
      tables: {
        ...state.tables,
        layouts: makeTable(
          {
            [LEVEL.storageKey]: {
              ...layoutOf('on', 'device'),
              layout: { level: 'yes please' },
            },
          },
          [LEVEL.storageKey],
          2,
        ),
      },
    };
    expect(deviceLevel(broken)).toBe('off');
    expect(unlockedIn(broken)).toBe(false);
  });

  it('treats either switch on as on', () => {
    expect(levelsUnlocked('on', 'off')).toBe(true);
    expect(levelsUnlocked('off', 'on')).toBe(true);
    expect(levelsUnlocked('off', 'off')).toBe(false);
  });
});
