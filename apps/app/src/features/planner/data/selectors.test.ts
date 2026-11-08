import {
  GOOGLE_ACCOUNT_ROW,
  PLANNER_COLLECTION_ROW,
  type PlannerCollectionRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { CALENDAR_COLOUR } from '../../../design/data-colours';
import { emptyState, makeTable, type StoreState } from '../../../store/state';
import { googleAccountView, UNLINKED } from './google-account';
import { collectionsSelector } from './selectors';

const ANA = 'a1b2c3d4-0000-4000-8000-000000000001';
const BEN = 'a1b2c3d4-0000-4000-8000-000000000002';
const AT = '2026-11-07T08:00:00.000Z';

function collection(id: string, profile: string): PlannerCollectionRow {
  return PLANNER_COLLECTION_ROW.parse({
    id,
    profile_id: profile,
    kind: 'calendar',
    name: 'Work',
    colour: 'work',
    icon: 'briefcase',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
    created_at: AT,
    updated_at: AT,
  });
}

const FIRST = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const SECOND = 'a1b2c3d4-0000-4000-8000-0000000000a2';
const THIRD = 'a1b2c3d4-0000-4000-8000-0000000000a3';

function stateWith(...rows: PlannerCollectionRow[]): StoreState {
  const state = emptyState();
  const table = makeTable(
    Object.fromEntries(rows.map((row) => [row.id, row])),
    rows.map((row) => row.id),
    1,
  );
  return { ...state, tables: { ...state.tables, planner_collections: table } };
}

describe('collectionsSelector', () => {
  const state = stateWith(collection(FIRST, ANA), collection(SECOND, BEN), collection(THIRD, ANA));

  it('keeps only the rows of the shown person', () => {
    expect(collectionsSelector(ANA)(state).map((row) => row.id)).toEqual([FIRST, THIRD]);
    expect(collectionsSelector(BEN)(state).map((row) => row.id)).toEqual([SECOND]);
  });

  it('hands back the same array while the table is unchanged', () => {
    const select = collectionsSelector(ANA);
    expect(select(state)).toBe(select(state));
  });

  it('shows nobody when the person is unknown and no session exists', () => {
    expect(collectionsSelector(null)(state)).toEqual([]);
  });
});

describe('googleAccountView', () => {
  it('reads a missing row as unlinked', () => {
    expect(googleAccountView(null)).toBe(UNLINKED);
    expect(UNLINKED.linked).toBe(false);
  });

  it('reads the status and email of a linked account', () => {
    const view = googleAccountView(
      GOOGLE_ACCOUNT_ROW.parse({
        profile_id: ANA,
        email: 'ana@example.com',
        scopes: [],
        status: 'linked',
        problem: null,
        calendar_ids: ['primary'],
        list_ids: [],
        last_sync_at: AT,
        last_error: null,
      }),
    );
    expect(view).toMatchObject({ linked: true, needsAttention: false, email: 'ana@example.com' });
  });

  it('flags an account that needs attention', () => {
    const view = googleAccountView(
      GOOGLE_ACCOUNT_ROW.parse({
        profile_id: ANA,
        email: 'ana@example.com',
        scopes: [],
        status: 'needs_attention',
        problem: 'invalid_grant',
        calendar_ids: [],
        list_ids: [],
        last_sync_at: null,
        last_error: 'revoked',
      }),
    );
    expect(view).toMatchObject({ linked: false, needsAttention: true, problem: 'invalid_grant' });
  });
});

describe('CALENDAR_COLOUR', () => {
  it('never uses viz-2, which equals primary', () => {
    expect(Object.values(CALENDAR_COLOUR)).not.toContain('viz-2');
    expect(CALENDAR_COLOUR).toEqual({
      work: 'viz-6',
      family: 'viz-1',
      personal: 'viz-3',
      health: 'positive',
      home: 'viz-4',
      shopping: 'viz-5',
    });
  });
});
