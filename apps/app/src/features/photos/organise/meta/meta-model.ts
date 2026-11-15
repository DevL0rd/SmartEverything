import type { PhotoDateEdit, PhotoLocationEdit, PhotoMetaPatch } from '@smarteverything/domain';
import { count } from '../../../../format/number';

const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;

export interface WallDraft {
  readonly day: string;
  readonly minute: number;
  readonly offsetMin: number;
}

export interface ShiftDraft {
  readonly later: boolean;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

export type DateDraft =
  | { readonly kind: 'keep' }
  | { readonly kind: 'set'; readonly wall: WallDraft }
  | { readonly kind: 'shift'; readonly shift: ShiftDraft };

export type LocationDraft =
  | { readonly kind: 'keep' }
  | { readonly kind: 'set'; readonly place: PhotoLocationEdit }
  | { readonly kind: 'clear' };

export const NO_SHIFT: ShiftDraft = { later: true, days: 0, hours: 0, minutes: 0 };

export const ZONE_OFFSETS: readonly number[] = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120,
  180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765,
  780, 840,
];

function two(value: number): string {
  return String(value).padStart(2, '0');
}

export function offsetText(offsetMin: number): string {
  const sign = offsetMin < 0 ? '-' : '+';
  const size = Math.abs(offsetMin);
  return `${sign}${two(Math.floor(size / 60))}:${two(size % 60)}`;
}

export function zoneText(offsetMin: number): string {
  return `UTC${offsetText(offsetMin)}`;
}

export function wallOf(takenAt: string, offsetMin: number): WallDraft {
  const shifted = new Date(Date.parse(takenAt) + offsetMin * MINUTE_MS);
  return {
    day: shifted.toISOString().slice(0, 10),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    offsetMin,
  };
}

export function momentText(wall: WallDraft): string {
  const clock = `${two(Math.floor(wall.minute / 60))}:${two(wall.minute % 60)}:00`;
  return `${wall.day}T${clock}${offsetText(wall.offsetMin)}`;
}

export function shiftMinutes(shift: ShiftDraft): number {
  const size = shift.days * DAY_MINUTES + shift.hours * 60 + shift.minutes;
  return shift.later ? size : -size;
}

function amount(value: number, one: string): string | null {
  if (value === 0) return null;
  return `${count(value)} ${value === 1 ? one : `${one}s`}`;
}

export function shiftText(shift: ShiftDraft): string {
  const parts = [
    amount(shift.days, 'day'),
    amount(shift.hours, 'hour'),
    amount(shift.minutes, 'minute'),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return 'No change yet';
  return `${parts.join(' ')} ${shift.later ? 'later' : 'earlier'}`;
}

function dateEditOf(draft: DateDraft): PhotoDateEdit | undefined {
  if (draft.kind === 'set') return { kind: 'set', takenAt: momentText(draft.wall) };
  if (draft.kind === 'shift') {
    const minutes = shiftMinutes(draft.shift);
    return minutes === 0 ? undefined : { kind: 'shift', minutes };
  }
  return undefined;
}

function locationEditOf(draft: LocationDraft): PhotoLocationEdit | null | undefined {
  if (draft.kind === 'set') return draft.place;
  return draft.kind === 'clear' ? null : undefined;
}

export function metaPatchOf(
  itemIds: readonly string[],
  date: DateDraft,
  location: LocationDraft,
): PhotoMetaPatch | null {
  const dateEdit = dateEditOf(date);
  const locationEdit = locationEditOf(location);
  if (itemIds.length === 0 || (dateEdit === undefined && locationEdit === undefined)) return null;
  return {
    itemIds: [...itemIds],
    ...(dateEdit === undefined ? {} : { date: dateEdit }),
    ...(locationEdit === undefined ? {} : { location: locationEdit }),
  };
}

const ZONE_NAME = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/u;

export function offsetOfZone(timeZone: string, at: number): number | null {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(at))
    .find((entry) => entry.type === 'timeZoneName');
  const match = part === undefined ? null : ZONE_NAME.exec(part.value);
  if (match === null) return null;
  if (match[1] === undefined) return 0;
  const size = Number(match[2]) * 60 + Number(match[3] ?? '0');
  return match[1] === '-' ? -size : size;
}

export function savedText(changed: number): string {
  return changed === 1 ? 'Date and location saved' : `${count(changed)} photos updated`;
}
