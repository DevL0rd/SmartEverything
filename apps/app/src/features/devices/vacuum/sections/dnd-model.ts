import type { JsonValue } from '@smarteverything/domain';

const BYTE = 256;
const HOUR_MAX = 23;
const MINUTE_MAX = 59;
const MINUTES_PER_DAY = 1440;
const FULL_TURN = 360;
const UINT32_MAX = 4294967295;

export function clockText(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export interface DndWindow {
  readonly startHour: number;
  readonly startMinute: number;
  readonly endHour: number;
  readonly endMinute: number;
}

function isWindowValue(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

function windowValid(window: DndWindow): boolean {
  const hours = window.startHour <= HOUR_MAX && window.endHour <= HOUR_MAX;
  const minutes = window.startMinute <= MINUTE_MAX && window.endMinute <= MINUTE_MAX;
  const differ = window.startHour !== window.endHour || window.startMinute !== window.endMinute;
  return hours && minutes && differ;
}

export function readDndWindow(value: JsonValue | undefined): DndWindow | null {
  if (!isWindowValue(value)) {
    return null;
  }
  const window = {
    startHour: Math.floor(value / BYTE ** 3),
    startMinute: Math.floor(value / BYTE ** 2) % BYTE,
    endHour: Math.floor(value / BYTE) % BYTE,
    endMinute: value % BYTE,
  };
  return windowValid(window) ? window : null;
}

export function encodeDndWindow(window: DndWindow): number | null {
  if (!windowValid(window)) {
    return null;
  }
  const { startHour, startMinute, endHour, endMinute } = window;
  return ((startHour * BYTE + startMinute) * BYTE + endHour) * BYTE + endMinute;
}

export function dndWindowText(window: DndWindow): string {
  return `${clockText(window.startHour, window.startMinute)} to ${clockText(window.endHour, window.endMinute)}`;
}

export interface DndRing {
  readonly startAngle: number;
  readonly sweep: number;
}

export function dndRingOf(window: DndWindow): DndRing {
  const start = window.startHour * 60 + window.startMinute;
  const end = window.endHour * 60 + window.endMinute;
  const length = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return {
    startAngle: (start / MINUTES_PER_DAY) * FULL_TURN,
    sweep: (length / MINUTES_PER_DAY) * FULL_TURN,
  };
}
