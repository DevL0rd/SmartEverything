import type { EventRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { placeVisitsOf } from './phone-places';

function row(
  id: string,
  kind: EventRow['kind'],
  at: string,
  details: EventRow['details'],
): EventRow {
  return {
    id,
    device_id: 'phone-1',
    kind,
    occurred_at: at,
    details,
    acknowledged_at: null,
    created_at: at,
  };
}

describe('place visits', () => {
  it('lists arrivals and departures oldest first', () => {
    const visits = placeVisitsOf([
      row('b', 'place_left', '2026-10-18T09:00:00.000Z', { place: 'Home' }),
      row('a', 'place_arrived', '2026-10-18T08:00:00.000Z', { place: 'Gym' }),
    ]);
    expect(visits.map((visit) => [visit.id, visit.arrived, visit.place])).toEqual([
      ['a', true, 'Gym'],
      ['b', false, 'Home'],
    ]);
  });

  it('skips events without a place name', () => {
    expect(placeVisitsOf([row('a', 'place_arrived', '2026-10-18T08:00:00.000Z', {})])).toEqual([]);
  });
});
