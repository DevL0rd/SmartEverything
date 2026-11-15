import type { WatchCalendarEvent } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { instantsOf } from '../../src/planner/instants';
import { WatchCalendar } from '../../src/planner/watch-calendar';
import {
  NOW,
  ports,
  preferencesOf,
  settle,
  startWatchHarness,
  stopWatchHarness,
  w,
} from '../support/watch-harness';

beforeEach(startWatchHarness);

afterEach(stopWatchHarness);

describe('calendar push', () => {
  let calendar: WatchCalendar;
  let collectionId: string;

  function addEvent(title: string, start: string, end: string, notes = ''): void {
    w.test.store.plannerItems.insert({
      ...instantsOf({
        start_local: start,
        end_local: end,
        time_zone: 'UTC',
        all_day: false,
        rrule: null,
      }),
      profile_id: w.owner.profileId,
      collection_id: collectionId,
      kind: 'event',
      parent_id: null,
      title,
      notes,
      location: 'Office',
      priority: null,
      tags: [],
      estimate_minutes: null,
      start_local: start,
      end_local: end,
      time_zone: 'UTC',
      all_day: false,
      due_date: null,
      due_at: null,
      rrule: null,
      exdates: [],
      series_id: null,
      original_start: null,
      status: 'open',
      position: 0,
      completion: { kind: 'manual' },
      attachments: [],
      reminders: [{ minutes_before: 10 }],
      google: null,
      assignee_id: null,
      ical_uid: null,
      ical_sequence: 0,
      booking_page_id: null,
      created_by: 'person',
    });
  }

  function calendars(): WatchCalendarEvent[][] {
    return w.sent.flatMap((action) => (action.type === 'set_calendar' ? [[...action.events]] : []));
  }

  beforeEach(() => {
    collectionId = w.test.store.plannerCollections.insert({
      profile_id: w.owner.profileId,
      kind: 'calendar',
      name: 'Work',
      colour: 'work',
      icon: 'briefcase',
      position: 0,
      visible: true,
      default_reminders: [],
      source: 'local',
      audience: 'personal',
      feed: null,
      google: null,
    }).id;
    calendar = new WatchCalendar({
      ...ports(),
      refresh: (profileId): Promise<void> => {
        w.refreshed.push(profileId);
        return Promise.resolve();
      },
      now: (): Date => NOW,
    });
    calendar.start();
  });

  afterEach(() => {
    calendar.stop();
  });

  it('pushes the next events after pulling Google, and again only when they change', async () => {
    addEvent('Standup', '2026-11-08T09:00', '2026-11-08T09:30', 'Daily');
    await settle();
    expect(w.refreshed).toEqual([w.owner.profileId]);
    expect(calendars()).toEqual([
      [
        {
          title: 'Standup',
          description: 'Daily',
          location: 'Office',
          start: Date.parse('2026-11-08T09:00:00Z') / 1000,
          end: Date.parse('2026-11-08T09:30:00Z') / 1000,
          allDay: false,
          remindMinutes: 10,
        },
      ],
    ]);
    calendar.connected(w.watchId);
    await settle();
    expect(calendars()).toHaveLength(2);
    addEvent('Review', '2026-11-09T09:00', '2026-11-09T10:00');
    await settle();
    expect(
      calendars()
        .at(-1)
        ?.map((event) => event.title),
    ).toEqual(['Standup', 'Review']);
  });

  it('keeps only the next 50 events, the watch limit', async () => {
    for (let day = 0; day < 60; day += 1) {
      const date = Temporal.PlainDate.from('2026-11-08').add({ days: day }).toString();
      addEvent(`Event ${String(day)}`, `${date}T09:00`, `${date}T10:00`);
    }
    await settle();
    const last = calendars().at(-1) ?? [];
    expect(last).toHaveLength(50);
    expect(last[0]?.title).toBe('Event 0');
    expect(last[49]?.title).toBe('Event 49');
  });

  it('pushes nothing when the setting is off', async () => {
    w.preferences = preferencesOf({ watch_alarm_sync: true, watch_calendar_push: false });
    addEvent('Standup', '2026-11-08T09:00', '2026-11-08T09:30');
    calendar.connected(w.watchId);
    await settle();
    expect(calendars()).toEqual([]);
    expect(w.refreshed).toEqual([]);
  });
});
