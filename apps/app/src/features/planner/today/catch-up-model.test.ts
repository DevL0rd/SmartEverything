import type {
  PlannerDay,
  PlannerHappened,
  PlannerOccurrenceView,
  PlannerRingRow,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { clock, dayLabel, zonedStartOfDay } from '../../../format/time';

vi.mock('../../assistant', () => ({ askAssistantWith: vi.fn() }));
vi.mock('../../devices', () => ({ DeviceFace: (): null => null }));

const {
  catchUpCardsOf,
  fitPromptOf,
  ghostStackOf,
  missedAlarmNameOf,
  missedAlarmTitleOf,
  missedReasonOf,
} = await import('./catch-up-model');
const { occurrenceWhenOf } = await import('../frame/occurrence-list');
const { ribbonLabelOf, ribbonMarksOf } = await import('./done-ribbon');
const { lensOf, lensPillOf, lensTimingOf, lensRuleOf } = await import('./now-lens');
const { occurrenceKeyOf } = await import('./river-model');

const ME = '00000000-0000-4000-8000-000000000001';
const ZONE = 'Europe/Berlin';

function occurrence(
  id: string,
  title: string,
  patch: Partial<PlannerOccurrenceView> = {},
): PlannerOccurrenceView {
  return {
    item_id: `00000000-0000-4000-8000-0000000000${id}`,
    occurrence_key: 'single',
    collection_id: '00000000-0000-4000-8000-000000000020',
    kind: 'task',
    title,
    location: null,
    priority: null,
    all_day: false,
    start: null,
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
    ...patch,
  };
}

function ring(id: string, patch: Partial<PlannerRingRow>): PlannerRingRow {
  return {
    id: `00000000-0000-4000-8000-0000000001${id}`,
    kind: 'alarm',
    ref_id: '00000000-0000-4000-8000-000000000040',
    profile_id: ME,
    due_at: '2026-11-07T07:30:00.000Z',
    rang_at: null,
    dismissed_at: null,
    snoozes: 0,
    target: null,
    outcome: 'missed',
    missed_reason: 'phone_off',
    ...patch,
  };
}

function day(patch: Partial<PlannerDay>): PlannerDay {
  return {
    date: '2026-11-07',
    time_zone: ZONE,
    now: '2026-11-07T13:20:00.000Z',
    missed: [],
    current: [],
    upcoming: [],
    done: [],
    happened: [],
    rings: [],
    next_alarm_at: null,
    strip: [],
    ...patch,
  };
}

const water = occurrence('11', 'Drink 500 ml of water', {
  due_at: '2026-11-07T11:00:00.000Z',
  status: 'missed',
});
const dentist = occurrence('12', 'Call the dentist', {
  start: '2026-11-07T09:00:00.000Z',
  end: '2026-11-07T09:15:00.000Z',
  status: 'missed',
});
const someday = occurrence('13', 'Sort the photos', { status: 'missed' });

describe('the catch-up deck', () => {
  it('orders missed items and missed alarms by when they were due, undated items last', () => {
    const alarm = ring('01', {});
    const cards = catchUpCardsOf(
      day({ missed: [someday, water, dentist], rings: [alarm] }),
      [],
      new Set(),
    );
    expect(cards.map((card) => card.key)).toEqual([
      `alarm:${alarm.id}`,
      `${dentist.item_id}:single`,
      `${water.item_id}:single`,
      `${someday.item_id}:single`,
    ]);
  });

  it('keeps alarms that rang out of the deck and drops the cards already acted on', () => {
    const rang = ring('02', {
      outcome: 'rang',
      missed_reason: null,
      rang_at: '2026-11-07T07:30:00.000Z',
    });
    const cards = catchUpCardsOf(
      day({ missed: [water, dentist], rings: [rang] }),
      [],
      new Set([`${dentist.item_id}:single`]),
    );
    expect(cards.map((card) => card.key)).toEqual([`${water.item_id}:single`]);
  });

  it('breaks a tie of the same due time by the card key, so the order never flips', () => {
    const at = '2026-11-07T11:00:00.000Z';
    const second = occurrence('14', 'Water the plants', { due_at: at, status: 'missed' });
    const keys = catchUpCardsOf(day({ missed: [second, water] }), [], new Set()).map(
      (card) => card.key,
    );
    expect(keys).toEqual([...keys].sort());
  });

  it('shows one ghost card for every further missed item', () => {
    expect(ghostStackOf(1).ghosts).toHaveLength(0);
    expect(ghostStackOf(2).ghosts).toHaveLength(1);
    expect(ghostStackOf(9).ghosts).toHaveLength(8);
    const stack = ghostStackOf(3);
    expect(stack.ghosts.map((ghost) => ghost.left)).toEqual([12, 24]);
    expect(stack.ghosts.map((ghost) => ghost.bottom)).toEqual([7, 0]);
    expect(stack.pad.paddingBottom).toBe(14);
  });

  it('asks the AI to fit only the missed items, never the alarms', () => {
    const cards = catchUpCardsOf(day({ missed: [water], rings: [ring('03', {})] }), [], new Set());
    expect(fitPromptOf(cards)).toBe(
      'Fit what I missed into the rest of today: Drink 500 ml of water.',
    );
    const alarmsOnly = catchUpCardsOf(day({ rings: [ring('04', {})] }), [], new Set());
    expect(fitPromptOf(alarmsOnly)).toBeNull();
  });

  it('names the day of a missed alarm and a missed task from an earlier day', () => {
    const earlier = ring('06', { due_at: '2026-11-05T08:00:00.000Z' });
    const yesterday = ring('07', { due_at: '2026-11-06T08:00:00.000Z' });
    const overdue = occurrence('15', 'Renew the passport', {
      due_date: '2026-11-05',
      status: 'missed',
    });
    const today = day({ missed: [overdue], rings: [earlier, yesterday] });
    const cards = catchUpCardsOf(today, [], new Set());
    const [first, second, third] = cards;
    if (first?.kind !== 'alarm' || second?.kind !== 'alarm') throw new Error('alarms first');
    const time = clock('2026-11-05T08:00:00.000Z', ZONE);
    const thursday = dayLabel('2026-11-05T08:00:00.000Z', Date.parse(today.now), ZONE);
    expect(thursday).not.toBe('Today');
    expect(missedAlarmTitleOf(first, today)).toBe(`Missed alarm ${thursday} ${time}`);
    expect(missedAlarmTitleOf(second, today)).toBe(
      `Missed alarm yesterday ${clock('2026-11-06T08:00:00.000Z', ZONE)}`,
    );
    expect(missedAlarmNameOf(first, today)).toBe(`Alarm · ${thursday} ${time}`);
    expect(third?.kind === 'item' && occurrenceWhenOf(third.occurrence, today)).toBe(
      `Due ${dayLabel(zonedStartOfDay('2026-11-05', ZONE), Date.parse(today.now), ZONE)}`,
    );
    expect(occurrenceWhenOf({ ...overdue, due_date: '2026-11-07' }, today)).toBe('Due today');
  });

  it('names a missed alarm by its time and says why it did not ring', () => {
    const [card] = catchUpCardsOf(day({ rings: [ring('05', {})] }), [], new Set());
    expect(card?.kind).toBe('alarm');
    if (card?.kind !== 'alarm') return;
    expect(missedAlarmTitleOf(card, day({}))).toBe(
      `Missed alarm ${clock('2026-11-07T07:30:00.000Z', ZONE)}`,
    );
    expect(missedReasonOf(card.ring)).toBe('phone was off');
    expect(missedReasonOf({ ...card.ring, missed_reason: 'hub_down' })).toBe('hub was off');
  });
});

describe('the done ribbon', () => {
  const brushed = occurrence('21', 'Brush teeth', {
    status: 'done',
    completed_at: '2026-11-07T06:41:00.000Z',
    completed_by: 'signal',
  });
  const bill = occurrence('22', 'Pay the electricity bill', {
    status: 'done',
    completed_at: '2026-11-07T08:30:00.000Z',
    completed_by: 'person',
  });
  const washer: PlannerHappened = {
    at: '2026-11-07T12:05:00.000Z',
    source: 'event',
    deviceId: null,
    summary: 'Washer finished · 1 h 12 min',
  };
  const woke = ring('06', {
    due_at: '2026-11-07T06:00:00.000Z',
    rang_at: '2026-11-07T06:00:00.000Z',
    dismissed_at: '2026-11-07T06:09:00.000Z',
    snoozes: 1,
    outcome: 'rang',
    missed_reason: null,
  });

  it('lays done items, the wake-up and what happened out in time order', () => {
    const marks = ribbonMarksOf(day({ done: [bill, brushed], happened: [washer], rings: [woke] }));
    expect(marks.map((mark) => mark.kind)).toEqual(['woke', 'done', 'done', 'happened']);
    expect(ribbonLabelOf(marks)).toEqual({ done: 3, happened: 'and 1 thing that happened' });
  });

  it('leaves the happened part out when nothing happened', () => {
    expect(ribbonLabelOf(ribbonMarksOf(day({ done: [bill] })))).toEqual({
      done: 1,
      happened: null,
    });
  });
});

describe('the now lens', () => {
  const walk = occurrence('31', 'Walk on the treadmill', {
    start: '2026-11-07T13:30:00.000Z',
    end: '2026-11-07T14:00:00.000Z',
  });
  const bill = occurrence('32', 'Pay the bill', {
    status: 'done',
    completed_at: '2026-11-07T12:50:00.000Z',
    completed_by: 'person',
  });

  it('shows the current item first, then the next one, and skips one already acted on', () => {
    const current = occurrence('33', 'Standup', { start: '2026-11-07T13:00:00.000Z' });
    expect(lensOf(day({ current: [current], upcoming: [walk] }), new Set())).toBe(current);
    expect(
      lensOf(day({ current: [current], upcoming: [walk] }), new Set([occurrenceKeyOf(current)])),
    ).toBe(walk);
    expect(lensOf(day({}), new Set())).toBeNull();
  });

  it('counts down to the next item over the free time since the last thing ended', () => {
    const timing = lensTimingOf(
      walk,
      day({ done: [bill] }),
      Date.parse('2026-11-07T13:20:00.000Z'),
    );
    expect(timing).toEqual({ phase: 'next', minutes: 10, progress: 0.75 });
    expect(lensPillOf(timing)).toBe('Up next · in 10 min');
  });

  it('shows the time left of the item that is on now', () => {
    const timing = lensTimingOf(walk, day({}), Date.parse('2026-11-07T13:45:00.000Z'));
    expect(timing).toEqual({ phase: 'now', minutes: 15, progress: 0.5 });
    expect(lensPillOf(timing)).toBe('Now · 15 min left');
    expect(lensTimingOf(occurrence('34', 'Any time'), day({}), 0)).toBeNull();
  });

  it('words the up next rule like the editor, minimum length included', () => {
    expect(lensRuleOf({ kind: 'manual' }, null)).toBeNull();
    const rule = {
      kind: 'signal',
      window: 'day',
      minSeconds: 1200,
      matcher: {
        source: 'event',
        kind: 'session_end',
        subject: '00000000-0000-4000-8000-000000000050',
        match: { kind: 'walk' },
      },
    } as const;
    const treadmill = {
      id: '00000000-0000-4000-8000-000000000050',
      label: 'Treadmill',
      family: 'treadmill',
    } as const;
    expect(lensRuleOf(rule, treadmill)).toBe('Done when a walk of 20 min or more ends');
  });
});
