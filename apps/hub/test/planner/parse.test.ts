import {
  SIGNAL_SOURCES,
  triggerCatalogue,
  type CatalogueDevice,
  type TriggerCatalogue,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { parsePlannerText, type ParseInput } from '../../src/planner/parse';
import { suggestCompletions } from '../../src/planner/suggest-completion';

const NOW = new Date('2026-11-07T08:00:00.000Z');
const ZONE = 'Europe/Berlin';
const HEALTH = '00000000-0000-4000-8000-0000000000a1';
const INBOX = '00000000-0000-4000-8000-0000000000a2';

function parse(
  text: string,
  overrides: Partial<ParseInput> = {},
): ReturnType<typeof parsePlannerText> {
  return parsePlannerText({
    text,
    collectionId: INBOX,
    collections: [
      { id: HEALTH, name: 'Health' },
      { id: INBOX, name: 'Inbox' },
    ],
    timeZone: ZONE,
    now: NOW,
    previewCount: 4,
    ...overrides,
  });
}

describe('quick add parser', () => {
  it('reads several times a day, a list and a priority into one repeating task', () => {
    const result = parse('brush teeth every day 07:30 and 22:00 #health !2');
    expect(result.draft).toMatchObject({
      collection_id: HEALTH,
      kind: 'task',
      title: 'brush teeth',
      priority: 2,
      tags: [],
      start_local: '2026-11-07T07:30:00',
      time_zone: ZONE,
      all_day: false,
      due_date: null,
      due_at: null,
      rrule: 'FREQ=DAILY;BYHOUR=7,22;BYMINUTE=0,30;BYSETPOS=2,3',
    });
    expect(result.repeat_text).toBe('Every day at 07:30 and 22:00');
    expect(result.next_occurrences).toEqual([
      '2026-11-07T21:00:00.000Z',
      '2026-11-08T06:30:00.000Z',
      '2026-11-08T21:00:00.000Z',
      '2026-11-09T06:30:00.000Z',
    ]);
  });

  it('lists every hour when all times share the minute', () => {
    const result = parse('stretch every day 07:00 and 19:00');
    expect(result.draft.rrule).toBe('FREQ=DAILY;BYHOUR=7,19;BYMINUTE=0');
    expect(result.next_occurrences[0]).toBe('2026-11-07T18:00:00.000Z');
  });

  it('refuses different minutes on a weekly repeat instead of adding times nobody asked for', () => {
    expect(() => parse('gym every mon 07:30 and 22:00')).toThrow(/daily repeat/);
  });

  it('starts a weekday list on the first matching day', () => {
    const result = parse('gym every mon, wed and fri 18:00');
    expect(result.draft.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(result.draft.start_local).toBe('2026-11-09T18:00:00');
    expect(result.repeat_text).toBe('Every week on Mon, Wed, Fri at 18:00');
  });

  it('turns weekdays into a spoken label', () => {
    const result = parse('standup every weekday 09:15');
    expect(result.draft.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(result.repeat_text).toBe('Every weekday at 09:15');
  });

  it('makes a repeat without a time an all-day item with an interval', () => {
    const result = parse('water plants every other day');
    expect(result.draft).toMatchObject({
      all_day: true,
      time_zone: null,
      start_local: '2026-11-07',
      rrule: 'FREQ=DAILY;INTERVAL=2',
    });
    expect(result.next_occurrences[0]).toBe('2026-11-07T00:00:00.000Z');
  });

  it('gives a dated task a due date and instant', () => {
    const result = parse('pay rent tomorrow 18:00');
    expect(result.draft).toMatchObject({
      title: 'pay rent',
      kind: 'task',
      due_date: '2026-11-08',
      due_at: '2026-11-08T17:00:00.000Z',
      start_local: null,
      rrule: null,
    });
    expect(result.next_occurrences).toEqual([]);
    expect(result.repeat_text).toBeNull();
  });

  it('makes a time range an event', () => {
    const result = parse('team meeting tomorrow 10:00-11:30');
    expect(result.draft).toMatchObject({
      kind: 'event',
      title: 'team meeting',
      start_local: '2026-11-08T10:00:00',
      end_local: '2026-11-08T11:30:00',
      time_zone: ZONE,
    });
  });

  it('moves a time that has passed today to tomorrow', () => {
    expect(parse('call mum at 8am').draft.due_at).toBe('2026-11-08T07:00:00.000Z');
    expect(parse('call mum at 11pm').draft.due_at).toBe('2026-11-07T22:00:00.000Z');
  });

  it('keeps an unlisted hash as a tag and leaves undated text undated', () => {
    const result = parse('buy milk #errands !1');
    expect(result.draft).toMatchObject({
      collection_id: INBOX,
      tags: ['errands'],
      priority: 1,
      due_date: null,
      start_local: null,
    });
  });

  it('rejects text that is only markers', () => {
    expect(() => parse('#health !2 every day 07:30')).toThrow(/Write what to add/);
  });
});

function device(
  id: string,
  name: string,
  model: string,
  kind: CatalogueDevice['kind'],
): CatalogueDevice {
  return { id, name, model, kind, roomId: null, capabilities: [] };
}

const BRUSH = device(
  '00000000-0000-4000-8000-000000000b01',
  'Oral-B iO9',
  'oralb.toothbrush.io9',
  'other',
);
const TREADMILL = device(
  '00000000-0000-4000-8000-000000000b02',
  'Kingsmith G15',
  'kingsmith.treadmill.g15',
  'other',
);
const BOTTLE = device(
  '00000000-0000-4000-8000-000000000b03',
  'Kitchen bottle',
  'larq.bottle.pv2',
  'other',
);

function catalogueOf(devices: readonly CatalogueDevice[]): TriggerCatalogue {
  return triggerCatalogue(SIGNAL_SOURCES, { devices, rooms: [], people: [], chats: [] }, []);
}

const suggest = (
  title: string,
  devices: readonly CatalogueDevice[],
  notes = '',
): ReturnType<typeof suggestCompletions> =>
  suggestCompletions({ title, notes, attachments: [], catalogue: catalogueOf(devices) });

describe('completion suggestions', () => {
  it('suggests the toothbrush finishing a brushing session for "brush teeth"', () => {
    expect(suggest('brush teeth', [BRUSH, TREADMILL])).toEqual([
      {
        label: 'Oral-B iO9 finishes a brushing session',
        completion: {
          kind: 'signal',
          matcher: {
            source: 'event',
            kind: 'activity',
            subject: BRUSH.id,
            match: { brushing: 'finished' },
          },
          window: 'occurrence',
        },
        matcher: {
          source: 'event',
          kind: 'activity',
          subject: BRUSH.id,
          match: { brushing: 'finished' },
        },
      },
    ]);
  });

  it('narrows a treadmill suggestion by the word for the activity', () => {
    const [walk] = suggest('morning walk', [TREADMILL]);
    expect(walk?.label).toBe('Kingsmith G15 finishes a session');
    expect(walk?.matcher?.match).toEqual({ phase: 'finished', kind: 'walk' });
    expect(suggest('use the treadmill', [TREADMILL])[0]?.matcher?.match).toEqual({
      phase: 'finished',
    });
  });

  it('tells a drink, a refill and a clean of the bottle apart', () => {
    expect(suggest('drink water', [BOTTLE])[0]?.matcher?.match).toEqual({ activity: 'drink' });
    expect(suggest('refill the bottle', [BOTTLE])[0]?.matcher?.match).toEqual({
      activity: 'refill',
    });
  });

  it('suggests nothing without a matching device or matching words', () => {
    expect(suggest('brush teeth', [TREADMILL])).toEqual([]);
    expect(suggest('buy milk', [BRUSH, TREADMILL, BOTTLE])).toEqual([]);
  });

  it('suggests from an attached device even when the title has no keyword', () => {
    const result = suggestCompletions({
      title: 'Evening routine',
      notes: '',
      attachments: [{ kind: 'device', deviceId: BRUSH.id, face: null }],
      catalogue: catalogueOf([BRUSH, TREADMILL]),
    });
    expect(result.map((entry) => entry.label)).toEqual(['Oral-B iO9 finishes a brushing session']);
  });
});
