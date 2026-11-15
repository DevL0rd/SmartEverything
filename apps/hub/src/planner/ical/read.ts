import { appendTo } from '@smarteverything/domain';
import ICAL from 'ical.js';
import { IcalParseError, type IcalCalendar, type IcalEntry, type IcalUnsupported } from './model';
import { entryOf } from './read-entry';
import type { ReadContext } from './read-time';
import { durationFrom, durationSecondsOf, textOf, timeOf } from './values';
import { ZoneBook } from './zones';

export interface ReadOptions {
  readonly defaultZone: string;
}

const COMPONENTS = ['vevent', 'vtodo'] as const;

function rootsOf(text: string): readonly ICAL.Component[] {
  let parsed: unknown;
  try {
    parsed = ICAL.parse(text);
  } catch (cause) {
    throw new IcalParseError(cause instanceof Error ? cause.message : String(cause), { cause });
  }
  if (!Array.isArray(parsed)) throw new IcalParseError('no calendar was found');
  const jcals: readonly (string | unknown[])[] = typeof parsed[0] === 'string' ? [parsed] : parsed;
  const roots = jcals.map((jcal) => new ICAL.Component(jcal));
  const calendars = roots.filter((root) => root.name === 'vcalendar');
  if (calendars.length === 0) throw new IcalParseError('there is no VCALENDAR');
  return calendars;
}

function zoneOf(root: ICAL.Component, book: ZoneBook, fallback: string): string {
  const named = textOf(root, 'x-wr-timezone');
  const resolved = named === null ? null : book.resolve(named);
  return resolved?.kind === 'iana' ? resolved.zone : fallback;
}

function groupedByUid(components: readonly ICAL.Component[]): Map<string, ICAL.Component[]> {
  const groups = new Map<string, ICAL.Component[]>();
  for (const component of components) {
    const key = `${component.name}\u0000${textOf(component, 'uid') ?? ''}`;
    appendTo(groups, key, component);
  }
  return groups;
}

function standaloneOverride(component: ICAL.Component, context: ReadContext): IcalEntry[] {
  const entry = entryOf(component, [], context);
  if (entry === null) return [];
  const mark = timeOf(component.getFirstProperty('recurrence-id'))?.toString() ?? '';
  return [{ ...entry, uid: `${entry.uid}#${mark}` }];
}

function entriesOfRoot(root: ICAL.Component, context: ReadContext): IcalEntry[] {
  const components = COMPONENTS.flatMap((name) => root.getAllSubcomponents(name));
  for (const other of root.getAllSubcomponents()) {
    if (other.name !== 'vtimezone' && !components.includes(other)) {
      context.unsupported.push({
        part: 'component',
        detail: other.name.toUpperCase(),
      });
    }
  }
  const entries: IcalEntry[] = [];
  for (const group of groupedByUid(components).values()) {
    const masters = group.filter((each) => each.getFirstProperty('recurrence-id') === null);
    const overrides = group.filter((each) => each.getFirstProperty('recurrence-id') !== null);
    const [first, ...duplicates] = masters;
    context.unsupported.push(
      ...duplicates.map(() => ({
        part: 'component' as const,
        detail: 'a second item with the same UID',
      })),
    );
    if (first === undefined) {
      entries.push(...overrides.flatMap((each) => standaloneOverride(each, context)));
      continue;
    }
    const entry = entryOf(first, overrides, context);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

function refreshOf(root: ICAL.Component): number | null {
  const stated = durationSecondsOf(root.getFirstProperty('refresh-interval'));
  const published = textOf(root, 'x-published-ttl');
  const seconds = stated ?? (published === null ? null : durationFrom(published));
  return seconds === null || seconds <= 0 ? null : Math.max(1, Math.ceil(seconds / 60));
}

export function readCalendar(text: string, options: ReadOptions): IcalCalendar {
  const entries: IcalEntry[] = [];
  const unsupported: IcalUnsupported[] = [];
  const roots = rootsOf(text);
  for (const root of roots) {
    const book = new ZoneBook(root);
    const context: ReadContext = {
      book,
      defaultZone: zoneOf(root, book, options.defaultZone),
      unsupported,
    };
    entries.push(...entriesOfRoot(root, context));
  }
  const stated = roots.flatMap((root) => refreshOf(root) ?? []);
  return {
    refreshMinutes: stated.length === 0 ? null : Math.min(...stated),
    entries,
    unsupported,
  };
}
