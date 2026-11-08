import type { DeveloperLevel, LayoutRow } from '@smarteverything/domain';
import { CLIENT_PREFS, SESSION } from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyState, makeTable, type StoreState } from '../store/state';
import { applyFlags, developerMode, logLevelOf, unlockedFlags } from './boot';
import { allOff, resolveFlags, withLogLevel } from './toggles';
import { shipLevelOf, withShipLevel } from '../platform/ship-level';

const PERSON = '00000000-0000-4000-8000-000000000001';

const CLIENT = '00000000-0000-4000-8000-000000000002';

const LEVEL = CLIENT_PREFS.developer_level;

const FLAGS = CLIENT_PREFS.developer_flags;

function levelRow(level: DeveloperLevel): LayoutRow {
  return {
    client_id: CLIENT,
    profile_id: null,
    page: LEVEL.storageKey,
    layout: LEVEL.encode(level),
    updated_at: '2026-11-05T02:00:00.000Z',
  };
}

function flagsRow(stored: Readonly<Record<string, boolean>>): LayoutRow {
  return {
    client_id: CLIENT,
    profile_id: null,
    page: FLAGS.storageKey,
    layout: FLAGS.encode({ flags: stored }),
    updated_at: '2026-11-05T02:00:00.000Z',
  };
}

function stateOf(rows: readonly LayoutRow[]): StoreState {
  const state = emptyState();
  return {
    ...state,
    session: SESSION.parse({
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
    }),
    tables: {
      ...state.tables,
      layouts: makeTable(
        Object.fromEntries(rows.map((row) => [row.page, row])),
        rows.map((row) => row.page),
        1,
      ),
    },
  };
}

function flagged(flags: Readonly<Record<string, boolean>>): readonly string[] {
  return Object.entries(flags)
    .filter(([, on]) => on)
    .map(([id]) => id);
}

const ALL_ON = Object.fromEntries(Object.keys(allOff()).map((id) => [id, true]));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('developer mode in a release build', () => {
  it('ships warnings outside developer mode and captures the selected extra detail when enabled', () => {
    const stored = flagsRow(withShipLevel({}, 'trace'));
    const disabled = applyFlags(stateOf([stored]));
    expect(shipLevelOf(disabled)).toBe('warn');
    expect(logLevelOf(disabled)).toBe('info');
    const enabled = applyFlags(stateOf([levelRow('on'), stored]));
    expect(shipLevelOf(enabled)).toBe('trace');
    expect(logLevelOf(enabled)).toBe('trace');
  });

  it('keeps every flag off without the switch, whatever is stored', () => {
    vi.stubGlobal('__DEV__', false);
    const state = stateOf([flagsRow(ALL_ON)]);
    expect(developerMode(state).developer).toBe(false);
    expect(flagged(unlockedFlags(state))).toEqual([]);
    expect(flagged(applyFlags(state))).toEqual([]);
  });

  it('turns the developer mode on with the switch, and nothing else on', () => {
    vi.stubGlobal('__DEV__', false);
    const state = stateOf([levelRow('on')]);
    expect(developerMode(state).developer).toBe(true);
    expect(flagged(unlockedFlags(state))).toEqual(['perf.frames', 'log.level.info']);
    expect(unlockedFlags(state)['perf.sampling']).toBe(false);
  });

  it('runs the options once they are chosen after the switch', () => {
    vi.stubGlobal('__DEV__', false);
    const state = stateOf([levelRow('on'), flagsRow({ 'perf.sampling': true })]);
    expect(unlockedFlags(state)['perf.sampling']).toBe(true);
  });

  it('raises the log level at once when the trace level is chosen', () => {
    vi.stubGlobal('__DEV__', false);
    const stored = withLogLevel({ 'perf.sampling': true }, 'trace');
    const state = stateOf([levelRow('on'), flagsRow(stored)]);
    expect(logLevelOf(applyFlags(state))).toBe('trace');
  });

  it('leaves the log level at info with the switch off', () => {
    vi.stubGlobal('__DEV__', false);
    const state = stateOf([flagsRow(withLogLevel({}, 'trace'))]);
    expect(logLevelOf(applyFlags(state))).toBe('info');
  });

  it('keeps the same defaults in a development build', () => {
    vi.stubGlobal('__DEV__', true);
    const state = emptyState();
    expect(flagged(unlockedFlags(state))).toEqual([]);
    expect(flagged(resolveFlags({}, developerMode(state).developer))).toEqual([]);
  });
});
