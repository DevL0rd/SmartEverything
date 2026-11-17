import { z } from 'zod';
import { clientPref, noLegacy } from './client-pref-definition';

export const CLOCK_FORMAT_PREF = z.strictObject({
  hour24: z
    .boolean()
    .describe(
      'Show and enter clock times on a 24-hour clock; false shows 12-hour times with an AM and PM choice',
    ),
});

export type ClockFormatPref = z.infer<typeof CLOCK_FORMAT_PREF>;

export function localeClockFormat(): ClockFormatPref {
  const hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
  if (hour12 === undefined) {
    throw new RangeError('The device locale names no 12 or 24 hour clock for hours.');
  }
  return { hour24: !hour12 };
}

export const CLOCK_FORMAT_CLIENT_PREFS = {
  clock_format: clientPref({
    storageKey: 'clock-format',
    scope: 'profile',
    version: 1,
    defaultValue: localeClockFormat(),
    schema: CLOCK_FORMAT_PREF,
    legacy: noLegacy,
  }),
} as const;
