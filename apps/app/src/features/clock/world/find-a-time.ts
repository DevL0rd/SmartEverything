import { insideClockWindow, localClock, type PlannerPreferences } from '@smarteverything/domain';
import { clock24, clockOfMinutes, localDayKey, zonedInstant } from '../../../format/time';
import { dayLabelOf } from '../../planner/calendar/month-model';
import { weekdayNameOf } from './world-time';

export const DAY_HOURS = 24;

const HOUR_MINUTES = 60;

export type HourTone = 'work' | 'day' | 'night';

export interface HourCell {
  readonly hour: number;
  readonly label: string;
  readonly tone: HourTone;
}

export interface HourPlan {
  readonly working: PlannerPreferences['general']['working_hours'];
  readonly dayStart: string;
  readonly dayEnd: string;
}

export interface HomeDay {
  readonly day: string;
  readonly zone: string;
}

export interface PlaceAt {
  readonly name: string;
  readonly zone: string;
  readonly home: boolean;
}

export const HOURS: readonly number[] = Array.from({ length: DAY_HOURS }, (_, hour) => hour);

export function hourPlanOf(general: PlannerPreferences['general']): HourPlan {
  return { working: general.working_hours, dayStart: general.day_start, dayEnd: general.day_end };
}

export function instantAt(home: HomeDay, hour: number): number {
  return zonedInstant(home.day, hour * HOUR_MINUTES, home.zone);
}

export function toneAt(at: number, zone: string, plan: HourPlan): HourTone {
  const local = localClock(new Date(at), zone);
  const working =
    plan.working.days.includes(local.weekday) &&
    insideClockWindow({ from: plan.working.start, to: plan.working.end }, local.minuteOfDay);
  if (working) return 'work';
  return insideClockWindow({ from: plan.dayStart, to: plan.dayEnd }, local.minuteOfDay)
    ? 'day'
    : 'night';
}

function cellLabelOf(at: number, zone: string): string {
  return String(Math.floor(localClock(new Date(at), zone).minuteOfDay / HOUR_MINUTES));
}

export function minutePastOf(zone: string, home: HomeDay): string | null {
  const minute = localClock(new Date(instantAt(home, 0)), zone).minuteOfDay % HOUR_MINUTES;
  return minute === 0 ? null : `:${String(minute).padStart(2, '0')}`;
}

export function hourCellsOf(zone: string, home: HomeDay, plan: HourPlan): readonly HourCell[] {
  return HOURS.map((hour) => {
    const at = instantAt(home, hour);
    return { hour, label: cellLabelOf(at, zone), tone: toneAt(at, zone, plan) };
  });
}

export function nextHourOf(now: number, zone: string): number {
  const hour = Math.floor(localClock(new Date(now), zone).minuteOfDay / HOUR_MINUTES);
  return Math.min(DAY_HOURS - 1, hour + 1);
}

export function placeTimeOf(place: PlaceAt, at: number, home: HomeDay): string {
  const time = clock24(at, place.zone);
  const name = place.home ? 'Home' : place.name;
  const sameDay = localDayKey(at, place.zone) === home.day;
  return sameDay ? `${time} ${name}` : `${time} ${name}, ${weekdayNameOf(at, place.zone)}`;
}

export function markerSummaryOf(places: readonly PlaceAt[], hour: number, home: HomeDay): string {
  const at = instantAt(home, hour);
  return places.map((place) => placeTimeOf(place, at, home)).join(' · ');
}

export function hourTimeOf(hour: number, home: HomeDay): string {
  return clock24(instantAt(home, hour), home.zone);
}

export function eventTextAt(hour: number, home: HomeDay): string {
  const from = clockOfMinutes(hour * HOUR_MINUTES);
  const to = clockOfMinutes((hour + 1) * HOUR_MINUTES);
  return `${dayLabelOf(home.day, true)} ${from} to ${to}`;
}

export function hourShiftedBy(hour: number, by: number): number {
  return Math.min(DAY_HOURS - 1, Math.max(0, hour + by));
}
