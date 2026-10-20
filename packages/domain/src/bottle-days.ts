import { z } from 'zod';

const DAY_MS = 86_400_000;

const MS_PER_SECOND = 1000;

export const BOTTLE_DAY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar day such as 2026-10-18');

export const BOTTLE_STATS_RANGES = ['day', 'week', 'month', 'year'] as const;

export type BottleStatsRange = (typeof BOTTLE_STATS_RANGES)[number];

export interface BottleDayWindow {
  readonly from: string;
  readonly to: string;
}

export function bottleDayIndex(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

export function bottleDayOfIndex(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

export function bottleDayAfter(day: string, count: number): string {
  return bottleDayOfIndex(bottleDayIndex(day) + count);
}

export function bottleDayOfInstant(iso: string, zoneOffsetSeconds: number): string {
  return new Date(Date.parse(iso) + zoneOffsetSeconds * MS_PER_SECOND).toISOString().slice(0, 10);
}

export function bottleMinuteOfInstant(iso: string, zoneOffsetSeconds: number): number {
  const local = new Date(Date.parse(iso) + zoneOffsetSeconds * MS_PER_SECOND);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function bottleWeekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export function bottleDaysBetween(window: BottleDayWindow): readonly string[] {
  const first = bottleDayIndex(window.from);
  const length = bottleDayIndex(window.to) - first + 1;
  return Array.from({ length }, (_, offset) => bottleDayOfIndex(first + offset));
}

export function bottleMonthsBack(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - count, 1));
  return shifted.toISOString().slice(0, 7);
}

export function bottleDaysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}
