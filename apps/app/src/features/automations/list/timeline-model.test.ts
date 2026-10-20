import type { Place } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { NOW, idOf, rowOf, runOf, timed } from './list-fixtures';
import { groupTimeline, nextUp, timelineOf, type TimelineEvent } from './timeline-model';

const PLACE: Place = { timeZone: 'UTC', location: null };

describe('timeline', () => {
  const rules = [
    {
      id: idOf(1),
      name: 'Evening',
      scheduled: { program: timed(), enabled: true, lastRunAt: null },
    },
    {
      id: idOf(2),
      name: 'Paused',
      scheduled: { program: timed(), enabled: false, lastRunAt: null },
    },
  ];
  const names = new Map([
    [idOf(1), 'Evening'],
    [idOf(3), 'Waiter'],
  ]);
  const parked = {
    ...runOf(1, 3, 'waiting', '2026-10-18T11:00:00.000Z'),
    wake_at: '2026-10-18T18:30:00.000Z',
  };
  const later = {
    ...runOf(2, 3, 'waiting', '2026-10-18T11:00:00.000Z'),
    wake_at: '2026-10-19T18:30:00.000Z',
  };

  it('lists timed triggers and parked waits inside the next twelve hours', () => {
    const events = timelineOf({ rules, runs: [parked, later], names, now: NOW, place: PLACE });
    expect(events.map((event) => [event.name, event.kind])).toEqual([
      ['Evening', 'timed'],
      ['Waiter', 'parked'],
    ]);
    expect(events[0]?.fraction).toBeCloseTo(6.5 / 12, 5);
    expect(nextUp(events)?.name).toBe('Evening');
  });

  it('keeps events in time order with no layout state', () => {
    const events = timelineOf({ rules, runs: [parked], names, now: NOW, place: PLACE });
    expect(events.map((event) => event.name)).toEqual(['Evening', 'Waiter']);
    expect(events.every((event) => !('lane' in event))).toBe(true);
  });

  it('is empty with nothing to show', () => {
    const events = timelineOf({
      rules: [],
      runs: [],
      names: new Map([[rowOf(1, timed()).id, 'x']]),
      now: NOW,
      place: PLACE,
    });
    expect(events).toEqual([]);
    expect(nextUp(events)).toBeNull();
  });

  describe('grouping', () => {
    const at = (name: string, id: string, minutes: number): TimelineEvent => ({
      key: `${id}:${String(minutes)}`,
      automationId: id,
      name,
      at: new Date(NOW + minutes * 60_000),
      kind: 'timed',
      fraction: minutes / 720,
    });

    it('collapses repeats of one automation into a group with its cadence', () => {
      const events = [0, 30, 60, 90, 120].map((minutes) => at('Kitchen', 'a', minutes));
      const groups = groupTimeline([...events, at('Porch', 'b', 45)]);
      expect(groups.map((group) => [group.name, group.events.length, group.everyMinutes])).toEqual([
        ['Kitchen', 5, 30],
        ['Porch', 1, null],
      ]);
    });

    it('reports no cadence for uneven or short runs', () => {
      expect(
        groupTimeline([0, 30, 100].map((m) => at('Kitchen', 'a', m)))[0]?.everyMinutes,
      ).toBeNull();
      expect(groupTimeline([0, 30].map((m) => at('Kitchen', 'a', m)))[0]?.everyMinutes).toBeNull();
    });
  });
});
