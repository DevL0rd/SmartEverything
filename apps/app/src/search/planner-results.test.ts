import type { PlannerSearchHit } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  PLANNER_GROUP_LABEL,
  PLANNER_GROUP_ROWS,
  plannerFoundText,
  plannerGroupStateOf,
  plannerSearchable,
  plannerShownOf,
  rowEdgeOf,
} from './planner-results';

const SIGNALS = { searchable: true, live: true, answered: true, failed: false, found: 3 };

function hit(index: number): PlannerSearchHit {
  return {
    occurrence: {
      item_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      occurrence_key: 'once',
      collection_id: '00000000-0000-4000-8000-000000000020',
      kind: 'event',
      title: `Event ${String(index)}`,
      location: null,
      priority: null,
      all_day: false,
      start: '2026-11-17T09:00:00.000Z',
      end: null,
      due_at: null,
      due_date: null,
      status: 'open',
      recurring: false,
      moved: false,
      completed_at: null,
      completed_by: null,
      evidence: null,
      attachments: [],
      google_state: null,
    },
    reading: 'next',
    matched: ['title'],
  };
}

describe('the Events and tasks search group', () => {
  it('is named for what it finds', () => {
    expect(PLANNER_GROUP_LABEL).toBe('Events and tasks');
  });

  it('searches only text with a letter or a number in it', () => {
    expect(plannerSearchable('dentist')).toBe(true);
    expect(plannerSearchable('  ')).toBe(false);
    expect(plannerSearchable('…')).toBe(false);
    expect(plannerSearchable('7')).toBe(true);
  });

  it('hides, waits, fails, empties and finds in that order of signals', () => {
    expect(plannerGroupStateOf({ ...SIGNALS, searchable: false })).toBe('hidden');
    expect(plannerGroupStateOf({ ...SIGNALS, live: false })).toBe('offline');
    expect(plannerGroupStateOf({ ...SIGNALS, failed: true })).toBe('failed');
    expect(plannerGroupStateOf({ ...SIGNALS, answered: false })).toBe('looking');
    expect(plannerGroupStateOf({ ...SIGNALS, found: 0 })).toBe('empty');
    expect(plannerGroupStateOf(SIGNALS)).toBe('found');
  });

  it('shows the first rows in hub order and leaves the rest to Show all', () => {
    const hits = Array.from({ length: 8 }, (_, index) => hit(index + 1));
    const shown = plannerShownOf(hits);
    expect(shown).toHaveLength(PLANNER_GROUP_ROWS);
    expect(shown[0]?.occurrence.title).toBe('Event 1');
    expect(plannerShownOf(hits.slice(0, 2))).toHaveLength(2);
    expect(plannerFoundText(8, false)).toBe('8 found');
    expect(plannerFoundText(20, true)).toBe('20+ found');
  });

  it('rounds the first and last row of the group', () => {
    expect(rowEdgeOf(0, 1)).toBe('only');
    expect(rowEdgeOf(0, 3)).toBe('first');
    expect(rowEdgeOf(1, 3)).toBe('middle');
    expect(rowEdgeOf(2, 3)).toBe('last');
  });
});
