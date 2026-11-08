import type { VacuumMode } from '@smarteverything/domain';
import type {
  VacuumRoomRef,
  VacuumScheduleClean,
  VacuumScheduleEntry,
  VacuumScheduleTime,
} from '../../../automations';

export const WEEK = [
  { day: 1, short: 'Mon', letter: 'M', name: 'Monday' },
  { day: 2, short: 'Tue', letter: 'T', name: 'Tuesday' },
  { day: 3, short: 'Wed', letter: 'W', name: 'Wednesday' },
  { day: 4, short: 'Thu', letter: 'T', name: 'Thursday' },
  { day: 5, short: 'Fri', letter: 'F', name: 'Friday' },
  { day: 6, short: 'Sat', letter: 'S', name: 'Saturday' },
  { day: 0, short: 'Sun', letter: 'S', name: 'Sunday' },
] as const;

export const EVERY_DAY: readonly number[] = WEEK.map((entry) => entry.day);

export const CLEAN_MODE_LABELS: Readonly<Record<VacuumMode, string>> = {
  sweep: 'Vacuum',
  sweep_mop: 'Vacuum and mop',
  sweep_then_mop: 'Vacuum, then mop',
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

function sameDays(days: readonly number[], wanted: readonly number[]): boolean {
  return days.length === wanted.length && wanted.every((day) => days.includes(day));
}

export function daysText(days: readonly number[]): string {
  if (days.length === 0 || sameDays(days, EVERY_DAY)) {
    return 'Every day';
  }
  if (sameDays(days, WEEKDAYS)) {
    return 'Weekdays';
  }
  if (sameDays(days, WEEKEND)) {
    return 'Weekends';
  }
  return WEEK.filter((entry) => days.includes(entry.day))
    .map((entry) => entry.short)
    .join(', ');
}

export function timesText(times: readonly VacuumScheduleTime[]): string {
  return times.map((time) => `${daysText(time.days)} at ${time.at}`).join(' and ');
}

export function listText(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} and ${items.slice(-1).join('')}`;
}

export function roomNameOf(room: VacuumRoomRef, names: ReadonlyMap<number, string>): string {
  return typeof room === 'string' ? room : (names.get(room) ?? `Room ${String(room)}`);
}

export function cleanText(clean: VacuumScheduleClean, names: ReadonlyMap<number, string>): string {
  if (clean.kind === 'home') {
    return 'Whole home';
  }
  const rooms = listText(clean.rooms.map((room) => roomNameOf(room, names)));
  return clean.mode === null ? rooms : `${rooms} · ${CLEAN_MODE_LABELS[clean.mode]}`;
}

export function cleansText(
  cleans: readonly VacuumScheduleClean[],
  names: ReadonlyMap<number, string>,
): string {
  return cleans.map((clean) => cleanText(clean, names)).join(', then ');
}

export function scheduleLabel(
  entry: VacuumScheduleEntry,
  names: ReadonlyMap<number, string>,
  next: string | null,
): string {
  const state = entry.enabled ? 'on' : 'off';
  const nextText = next === null ? '' : `, next ${next}`;
  return `${entry.name}, ${timesText(entry.times)}, cleans ${cleansText(entry.cleans, names)}, ${state}${nextText}`;
}

export function scheduleName(
  deviceLabel: string,
  roomNames: readonly string[],
  at: string,
): string {
  const what = roomNames.length === 0 ? 'the whole home' : listText(roomNames);
  return `${deviceLabel}: clean ${what} at ${at}`;
}

export function ownScheduleName(
  entry: VacuumScheduleEntry,
  deviceLabel: string,
  names: ReadonlyMap<number, string>,
): string | null {
  const [first] = entry.times;
  const [clean] = entry.cleans;
  const rooms =
    clean === undefined || clean.kind === 'home'
      ? []
      : clean.rooms.map((room) => roomNameOf(room, names));
  const generated =
    first !== undefined &&
    entry.cleans.length === 1 &&
    entry.name === scheduleName(deviceLabel, rooms, first.at);
  return generated ? null : entry.name;
}

const NEAR_DAYS: ReadonlySet<string> = new Set(['Today', 'Tomorrow']);

export function scheduleFootnote(nextDay: string | null, ownName: string | null): string {
  const day = nextDay !== null && NEAR_DAYS.has(nextDay) ? nextDay.toLowerCase() : nextDay;
  const state = day === null ? 'Off' : `Next clean ${day}`;
  return ownName === null ? state : `${state} · ${ownName}`;
}
