import ICAL from 'ical.js';
import type { IcalEntry } from './model';
import { entryComponents, type WriteContext } from './write-entry';
import { timezoneComponent } from './vtimezone';

export const ICAL_PRODUCT = '-//SmartEverything//Planner//EN';

export interface WriteOptions {
  readonly name: string | null;
  readonly now: Date;
}

function stampOf(now: Date): ICAL.Time {
  return ICAL.Time.fromDateTimeString(`${now.toISOString().slice(0, 19)}Z`);
}

export function writeCalendar(entries: readonly IcalEntry[], options: WriteOptions): string {
  const calendar = new ICAL.Component(['vcalendar', [], []]);
  calendar.updatePropertyWithValue('version', '2.0');
  calendar.updatePropertyWithValue('prodid', ICAL_PRODUCT);
  calendar.updatePropertyWithValue('calscale', 'GREGORIAN');
  if (options.name !== null) calendar.updatePropertyWithValue('x-wr-calname', options.name);
  const context: WriteContext = { stamp: stampOf(options.now), zones: new Map() };
  const components = entries.flatMap((entry) => entryComponents(entry, context));
  for (const [zone, year] of context.zones) {
    calendar.addSubcomponent(timezoneComponent(zone, year));
  }
  for (const component of components) calendar.addSubcomponent(component);
  return calendar.toString();
}
