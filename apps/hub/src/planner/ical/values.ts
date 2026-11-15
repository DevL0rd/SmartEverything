import ICAL from 'ical.js';

export function textOf(component: ICAL.Component, name: string): string | null {
  const value = component.getFirstPropertyValue(name);
  return typeof value === 'string' ? value : null;
}

export function numberOf(component: ICAL.Component, name: string): number | null {
  const value = component.getFirstPropertyValue(name);
  return typeof value === 'number' ? value : null;
}

export function timeOf(property: ICAL.Property | null): ICAL.Time | null {
  const value = property?.getFirstValue() ?? null;
  return value instanceof ICAL.Time ? value : null;
}

export function timesOf(property: ICAL.Property): readonly ICAL.Time[] {
  const values: unknown[] = property.getValues();
  return values.filter((value): value is ICAL.Time => value instanceof ICAL.Time);
}

export function periodStartsOf(property: ICAL.Property): readonly ICAL.Time[] {
  const values: unknown[] = property.getValues();
  return values.flatMap((value) => (value instanceof ICAL.Period ? [value.start] : []));
}

export function parameterOf(property: ICAL.Property, name: string): string | null {
  const value: unknown = property.getParameter(name);
  return typeof value === 'string' && value !== '' ? value : null;
}

export function durationSecondsOf(property: ICAL.Property | null): number | null {
  const value = property?.getFirstValue() ?? null;
  return value instanceof ICAL.Duration ? value.toSeconds() : null;
}

export function recurOf(component: ICAL.Component): ICAL.Recur | null {
  const value = component.getFirstPropertyValue('rrule');
  return value instanceof ICAL.Recur ? value : null;
}

export function durationFrom(text: string): number | null {
  try {
    return ICAL.Duration.fromString(text.trim()).toSeconds();
  } catch (cause) {
    if (cause instanceof Error) return null;
    throw cause;
  }
}
