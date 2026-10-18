import { describe, expect, it } from 'vitest';
import { BODY_READING_ROW, type BodyReadingRow } from '@smarteverything/domain';
import { bodyReadingsOf } from './people';
import { emptyState, makeTable, type StoreState } from './state';

const ADA = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';
const SCALE = '00000000-0000-4000-8000-0000000000c3';
const MOMENT = '2026-10-16T08:00:00.000Z';

function reading(id: string, over: Record<string, unknown>): BodyReadingRow {
  return BODY_READING_ROW.parse({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    device_id: SCALE,
    profile_id: ADA,
    measured_at: MOMENT,
    weight_kg: 70,
    impedance_low: null,
    impedance_high: null,
    heart_rate: null,
    scale_user: null,
    attribution: 'weight',
    bmi: null,
    composition: null,
    version: 1,
    saved_to_health_connect_at: null,
    created_at: MOMENT,
    updated_at: MOMENT,
    ...over,
  });
}

function stateWith(rows: readonly BodyReadingRow[]): StoreState {
  const base = emptyState();
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  return {
    ...base,
    tables: {
      ...base.tables,
      body_readings: makeTable(
        byId,
        rows.map((row) => row.id),
        1,
      ),
    },
  };
}

describe('bodyReadingsOf', () => {
  it('keeps the stored newest-first order of the counted weighings of one profile', () => {
    const state = stateWith([
      reading('1', {}),
      reading('2', { profile_id: BOB }),
      reading('3', { attribution: 'pending' }),
      reading('4', { weight_kg: null }),
      reading('5', { measured_at: '2026-10-15T08:00:00.000Z' }),
    ]);
    expect(bodyReadingsOf(ADA)(state).map((item) => item.id.slice(-1))).toEqual(['1', '5']);
  });

  it('returns the same list while the readings table has not changed', () => {
    const select = bodyReadingsOf(ADA);
    const state = stateWith([reading('1', {})]);
    const first = select(state);
    expect(select({ ...state, settings: null })).toBe(first);
  });

  it('computes again when the readings table changes', () => {
    const select = bodyReadingsOf(ADA);
    const first = select(stateWith([reading('1', {})]));
    expect(select(stateWith([reading('1', {}), reading('2', {})]))).not.toBe(first);
  });
});
