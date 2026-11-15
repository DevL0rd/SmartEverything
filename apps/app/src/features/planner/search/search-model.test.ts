import type {
  PlannerCollectionRow,
  PlannerOccurrenceView,
  PlannerSearchHit,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  calendarChipTextOf,
  choiceOfKinds,
  emptyFilter,
  filtered,
  foundTextOf,
  groupHits,
  hitTimeOf,
  hitsOf,
  isCollectionChosen,
  kindsOfChoice,
  matchedTextOf,
  searchCollectionsOf,
  toggledCollection,
  type HitFormat,
} from './search-model';

const ME = '00000000-0000-4000-8000-000000000001';
const WORK = '00000000-0000-4000-8000-000000000020';
const HOME = '00000000-0000-4000-8000-000000000021';
const AT = '2026-11-14T10:00:00.000Z';

const CLOCK = { now: Date.parse('2026-11-14T10:00:00.000Z'), today: '2026-11-14' };

const FORMAT: HitFormat = {
  day: (moment) => new Date(moment).toISOString().slice(0, 10),
  date: (day) => `on ${day}`,
  time: (moment) => new Date(moment).toISOString().slice(11, 16),
};

function occurrence(patch: Partial<PlannerOccurrenceView> = {}): PlannerOccurrenceView {
  return {
    item_id: '00000000-0000-4000-8000-000000000030',
    occurrence_key: 'once',
    collection_id: WORK,
    kind: 'event',
    title: 'Dentist',
    location: null,
    priority: null,
    all_day: false,
    start: '2026-11-17T09:00:00.000Z',
    end: '2026-11-17T09:30:00.000Z',
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
    ...patch,
  };
}

function hit(
  key: string,
  reading: PlannerSearchHit['reading'],
  patch: Partial<PlannerOccurrenceView> = {},
): PlannerSearchHit {
  return {
    occurrence: occurrence({ occurrence_key: key, ...patch }),
    reading,
    matched: ['title'],
  };
}

function collection(
  id: string,
  name: string,
  kind: PlannerCollectionRow['kind'],
): PlannerCollectionRow {
  return {
    id,
    profile_id: ME,
    kind,
    name,
    colour: 'work',
    icon: 'calendar',
    position: 0,
    visible: true,
    default_reminders: [],
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
    created_at: AT,
    updated_at: AT,
  };
}

describe('the planner search results', () => {
  it('joins the pages and drops a hit a later page repeats', () => {
    const hits = hitsOf([
      { hits: [hit('a', 'next'), hit('b', 'next')], next: 'c1' },
      { hits: [hit('b', 'next'), hit('c', 'last')], next: null },
    ]);
    expect(hits.map((entry) => entry.occurrence.occurrence_key)).toEqual(['a', 'b', 'c']);
    expect(hitsOf(undefined)).toEqual([]);
  });

  it('groups upcoming hits before earlier ones and leaves out an empty group', () => {
    const groups = groupHits([hit('a', 'next'), hit('b', 'last'), hit('c', 'next')]);
    expect(groups.map((group) => [group.title, group.hits.length])).toEqual([
      ['Upcoming', 2],
      ['Earlier', 1],
    ]);
    expect(groupHits([hit('b', 'last')]).map((group) => group.key)).toEqual(['past']);
    expect(groupHits([])).toEqual([]);
  });

  it('writes the time of an event, an all day event and a task', () => {
    expect(hitTimeOf(occurrence(), FORMAT, CLOCK).text).toBe('2026-11-17 · 09:00–09:30');
    expect(hitTimeOf(occurrence({ all_day: true }), FORMAT, CLOCK).text).toBe(
      '2026-11-17 · All day',
    );
    const task = { kind: 'task', start: null, end: null } as const;
    expect(
      hitTimeOf(occurrence({ ...task, due_at: '2026-11-18T08:00:00.000Z' }), FORMAT, CLOCK).text,
    ).toBe('Due 2026-11-18 · 08:00');
    expect(hitTimeOf(occurrence({ ...task, due_date: '2026-11-19' }), FORMAT, CLOCK)).toEqual({
      at: null,
      day: '2026-11-19',
      overdue: false,
      text: 'Due on 2026-11-19',
    });
    expect(hitTimeOf(occurrence(task), FORMAT, CLOCK).text).toBe('No date');
  });

  it('marks an open task whose day or moment has passed as overdue', () => {
    const task = { kind: 'task', start: null, end: null, status: 'open' } as const;
    const late = hitTimeOf(occurrence({ ...task, due_date: '2026-11-12' }), FORMAT, CLOCK);
    expect(late).toMatchObject({
      day: '2026-11-12',
      overdue: true,
      text: 'Overdue · on 2026-11-12',
    });
    expect(
      hitTimeOf(occurrence({ ...task, due_at: '2026-11-14T08:00:00.000Z' }), FORMAT, CLOCK).overdue,
    ).toBe(true);
    expect(
      hitTimeOf(occurrence({ ...task, status: 'done', due_date: '2026-11-12' }), FORMAT, CLOCK)
        .overdue,
    ).toBe(false);
    expect(
      hitTimeOf(occurrence({ ...task, status: 'missed', due_date: '2026-11-13' }), FORMAT, CLOCK)
        .overdue,
    ).toBe(true);
    expect(hitTimeOf(occurrence({ ...task, due_date: '2026-11-14' }), FORMAT, CLOCK).overdue).toBe(
      false,
    );
  });

  it('says where a hit matched when it was not the title', () => {
    expect(matchedTextOf(['title', 'notes'])).toBeNull();
    expect(matchedTextOf(['notes'])).toBe('Found in notes');
    expect(matchedTextOf(['guest', 'location'])).toBe('Found in guests and place');
  });

  it('counts the matches and marks that more pages wait', () => {
    expect(foundTextOf(1, false)).toBe('1 match');
    expect(foundTextOf(3, false)).toBe('3 matches');
    expect(foundTextOf(25, true)).toBe('25+ matches');
  });
});

describe('the planner search filters', () => {
  const work = collection(WORK, 'Work', 'calendar');
  const home = collection(HOME, 'Home jobs', 'list');

  it('starts from every calendar, leaves one out at a time and returns to all', () => {
    const all = [WORK, HOME];
    const one = toggledCollection(null, WORK, all);
    expect(one).toEqual([HOME]);
    expect(isCollectionChosen(one, WORK)).toBe(false);
    expect(isCollectionChosen(null, WORK)).toBe(true);
    expect(toggledCollection(one, WORK, all)).toBeNull();
    expect(toggledCollection(one, HOME, all)).toBeNull();
    expect(calendarChipTextOf(null, [work, home])).toBe('All calendars');
    expect(calendarChipTextOf([WORK], [work, home])).toBe('Work');
    expect(calendarChipTextOf([WORK, HOME], [work, home])).toBe('2 calendars');
  });

  it('maps the kind choice to the query kinds and back', () => {
    expect(kindsOfChoice('all')).toBeNull();
    expect(kindsOfChoice('task')).toEqual(['task']);
    expect(choiceOfKinds(['event'])).toBe('event');
    expect(choiceOfKinds(null)).toBe('all');
  });

  it('knows when any filter is set', () => {
    const plain = emptyFilter('dentist');
    expect(filtered(plain)).toBe(false);
    expect(filtered({ ...plain, when: 'past' })).toBe(true);
    expect(filtered({ ...plain, kinds: ['task'] })).toBe(true);
  });

  it('offers the calendars the person sees and their own task lists once each', () => {
    const shared = collection('00000000-0000-4000-8000-000000000022', 'Family', 'calendar');
    const rows = searchCollectionsOf([work, shared], [work, home]);
    expect(rows.map((row) => row.name)).toEqual(['Work', 'Family', 'Home jobs']);
  });
});
