import ICAL from 'ical.js';

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

interface Transition {
  readonly local: Temporal.PlainDateTime;
  readonly from: number;
  readonly to: number;
}

function transitionsIn(zone: string, year: number): readonly Transition[] {
  const end = Temporal.ZonedDateTime.from(`${String(year + 1)}-01-01T00:00:00[UTC]`).toInstant();
  const found: Transition[] = [];
  let at = Temporal.ZonedDateTime.from(`${String(year)}-01-01T00:00:00[UTC]`)
    .toInstant()
    .toZonedDateTimeISO(zone);
  for (
    let next = at.getTimeZoneTransition('next');
    next !== null && Temporal.Instant.compare(next.toInstant(), end) < 0;
    next = at.getTimeZoneTransition('next')
  ) {
    const before = next.subtract({ nanoseconds: 1 });
    const from = before.offsetNanoseconds / 1e9;
    found.push({
      local: next.toInstant().toZonedDateTimeISO('UTC').add({ seconds: from }).toPlainDateTime(),
      from,
      to: next.offsetNanoseconds / 1e9,
    });
    at = next;
  }
  return found;
}

function ruleOf(local: Temporal.PlainDateTime): string {
  const ordinal = local.day + 7 > local.daysInMonth ? -1 : Math.ceil(local.day / 7);
  const weekday = WEEKDAYS[local.dayOfWeek - 1];
  return `FREQ=YEARLY;BYMONTH=${String(local.month)};BYDAY=${String(ordinal)}${weekday ?? 'MO'}`;
}

const ANCHOR_YEAR = 1970;

function anchorOf(local: Temporal.PlainDateTime): Temporal.PlainDateTime {
  const first = Temporal.PlainDate.from({ year: ANCHOR_YEAR, month: local.month, day: 1 });
  const ordinal = local.day + 7 > local.daysInMonth ? -1 : Math.ceil(local.day / 7);
  const ahead = (local.dayOfWeek - first.dayOfWeek + 7) % 7;
  const date =
    ordinal === -1
      ? lastWeekday(first, local.dayOfWeek)
      : first.add({ days: ahead + (ordinal - 1) * 7 });
  return date.toPlainDateTime(local.toPlainTime());
}

function lastWeekday(first: Temporal.PlainDate, dayOfWeek: number): Temporal.PlainDate {
  const last = first.with({ day: first.daysInMonth });
  return last.subtract({ days: (last.dayOfWeek - dayOfWeek + 7) % 7 });
}

function observance(kind: 'standard' | 'daylight', transition: Transition): ICAL.Component {
  const component = new ICAL.Component(kind);
  component.addPropertyWithValue(
    'dtstart',
    ICAL.Time.fromDateTimeString(anchorOf(transition.local).toString({ smallestUnit: 'second' })),
  );
  component.addPropertyWithValue('tzoffsetfrom', ICAL.UtcOffset.fromSeconds(transition.from));
  component.addPropertyWithValue('tzoffsetto', ICAL.UtcOffset.fromSeconds(transition.to));
  component.addPropertyWithValue('rrule', ICAL.Recur.fromString(ruleOf(transition.local)));
  return component;
}

function flatObservance(zone: string, year: number): ICAL.Component {
  const end = Temporal.ZonedDateTime.from(`${String(year)}-12-31T23:59:59[${zone}]`);
  const seconds = end.offsetNanoseconds / 1e9;
  const component = new ICAL.Component('standard');
  component.addPropertyWithValue(
    'dtstart',
    ICAL.Time.fromDateTimeString(`${String(ANCHOR_YEAR)}-01-01T00:00:00`),
  );
  component.addPropertyWithValue('tzoffsetfrom', ICAL.UtcOffset.fromSeconds(seconds));
  component.addPropertyWithValue('tzoffsetto', ICAL.UtcOffset.fromSeconds(seconds));
  return component;
}

export function timezoneComponent(zone: string, year: number): ICAL.Component {
  const component = new ICAL.Component('vtimezone');
  component.addPropertyWithValue('tzid', zone);
  const changes = transitionsIn(zone, year);
  if (changes.length < 2) {
    component.addSubcomponent(flatObservance(zone, year));
    return component;
  }
  const lowest = Math.min(...changes.map((change) => change.to));
  for (const change of changes) {
    component.addSubcomponent(observance(change.to > lowest ? 'daylight' : 'standard', change));
  }
  return component;
}
