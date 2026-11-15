import { PLANNER_HOLIDAY_REGION, type PlannerHolidayRegion } from '@smarteverything/domain';
import Holidays from 'date-holidays';
import { z } from 'zod';

export const HOLIDAY_LANGUAGE = 'en';

const NAMES = z.record(z.string(), z.string());

export interface HolidayDay {
  readonly date: string;
  readonly name: string;
}

export class HolidayRegionError extends Error {
  override readonly name = 'HolidayRegionError';

  constructor(
    readonly country: string,
    readonly state: string | null,
  ) {
    super(
      state === null
        ? `There is no public holidays calendar for ${country}.`
        : `There is no public holidays calendar for ${state} in ${country}.`,
    );
  }
}

function rulesOf(country: string, state: string | null): Holidays {
  const options = { languages: HOLIDAY_LANGUAGE };
  return state === null ? new Holidays(country, options) : new Holidays(country, state, options);
}

function statesOf(country: string): Record<string, string> {
  const parsed = NAMES.safeParse(rulesOf(country, null).getStates(country, HOLIDAY_LANGUAGE));
  return parsed.success ? parsed.data : {};
}

let regions: readonly PlannerHolidayRegion[] | undefined;

export function holidayRegions(): readonly PlannerHolidayRegion[] {
  regions ??= Object.entries(NAMES.parse(rulesOf('US', null).getCountries(HOLIDAY_LANGUAGE)))
    .map(([country, name]) =>
      PLANNER_HOLIDAY_REGION.parse({
        country,
        name,
        states: Object.entries(statesOf(country))
          .map(([code, stateName]) => ({ code, name: stateName }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return regions;
}

export function assertHolidayRegion(country: string, state: string | null): void {
  const region = holidayRegions().find((candidate) => candidate.country === country);
  const known =
    region !== undefined &&
    (state === null || region.states.some((candidate) => candidate.code === state));
  if (!known) throw new HolidayRegionError(country, state);
}

export function regionName(country: string, state: string | null): string {
  const region = holidayRegions().find((candidate) => candidate.country === country);
  const place = region?.states.find((candidate) => candidate.code === state)?.name;
  return place === undefined ? (region?.name ?? country) : `${region?.name ?? country}, ${place}`;
}

export function holidaysOfYear(
  country: string,
  state: string | null,
  year: number,
): readonly HolidayDay[] {
  const days = new Map<string, HolidayDay>();
  for (const holiday of rulesOf(country, state).getHolidays(year)) {
    if (holiday.type !== 'public') continue;
    const date = holiday.date.slice(0, 10);
    days.set(`${date}|${holiday.name}`, { date, name: holiday.name });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
