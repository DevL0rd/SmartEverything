import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCalendar } from '../../src/planner/ical/read';
import type { IcalEntry } from '../../src/planner/ical/model';

export const NOW = new Date('2026-11-14T12:00:00.000Z');
export const ZONE = 'America/New_York';

export const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'ical', name), 'utf8');

export function calendarOf(...components: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    ...components,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function eventOf(...lines: string[]): string {
  const ownUid = lines.some((line) => line.startsWith('UID:'));
  return [
    'BEGIN:VEVENT',
    ...(ownUid ? [] : ['UID:e1']),
    'DTSTAMP:20261101T000000Z',
    ...lines,
    'END:VEVENT',
  ].join('\r\n');
}

export function read(text: string): ReturnType<typeof readCalendar> {
  return readCalendar(text, { defaultZone: ZONE });
}

export function first(text: string): IcalEntry {
  const entry = read(text).entries[0];
  if (entry === undefined) throw new Error('the calendar has no entry');
  return entry;
}
