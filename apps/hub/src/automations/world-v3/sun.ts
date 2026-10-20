import {
  localClock,
  shiftedDate,
  solarNoonOn,
  sunEventAt,
  type CalendarDate,
  type GeoPoint,
  type SunEvent,
} from '@smarteverything/domain';
import { z } from 'zod';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { homeLocation, homeZone } from './zone';
import type { WorldReadDeps } from './deps';

const OFFICIAL_ZENITH = 90.833;
const CIVIL_TWILIGHT_ZENITH = 96;
const GOLDEN_HOUR_ZENITH = 84;

const SUN_TIMES = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  offset: z.number(),
});

function calendarDate(text: string): CalendarDate {
  const [year = 0, month = 0, day = 0] = text.split('-').map(Number);
  const real = shiftedDate({ year, month, day }, 0);
  if (real.year !== year || real.month !== month || real.day !== day) {
    throw new ReadFailure('Invalid', `${text} is not a day on the calendar`);
  }
  return { year, month, day };
}

function dayOf(request: z.output<typeof SUN_TIMES>, now: Date, zone: string): CalendarDate {
  if (request.date !== undefined) return calendarDate(request.date);
  const { year, month, day } = localClock(now, zone);
  return { year, month, day };
}

function eventAt(event: SunEvent, day: CalendarDate, point: GeoPoint, zenith: number): Date | null {
  return sunEventAt(event, day, point, zenith);
}

function iso(moment: Date | null, offset: number): string | undefined {
  return moment === null ? undefined : new Date(moment.getTime() + offset).toISOString();
}

export function sunHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'date.sun_times': (inputs): ReadResult => {
      const request = parseInputs('date.sun_times', SUN_TIMES, inputs);
      const point = homeLocation(deps.store);
      if (point === null) throw new ReadFailure('NotFound', 'The home has no location set');
      const day = dayOf(request, deps.clock.now(), homeZone(deps.store));
      const at = (moment: Date | null): string | undefined => iso(moment, request.offset);
      return outputsOf({
        sunrise: at(eventAt('sunrise', day, point, OFFICIAL_ZENITH)),
        sunset: at(eventAt('sunset', day, point, OFFICIAL_ZENITH)),
        dawn: at(eventAt('sunrise', day, point, CIVIL_TWILIGHT_ZENITH)),
        dusk: at(eventAt('sunset', day, point, CIVIL_TWILIGHT_ZENITH)),
        solarNoon: at(solarNoonOn(day, point)),
        goldenHour: at(eventAt('sunset', day, point, GOLDEN_HOUR_ZENITH)),
      });
    },
  };
}
