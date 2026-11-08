import type { DriveTrashEntry } from '@smarteverything/domain';
import { bytes, count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { daysBetween, localDayKey, monthShort } from '../../../format/time';

export interface TrashPeople {
  readonly me: string | null;
  readonly names: ReadonlyMap<string, string>;
}

export type Deleter =
  | { readonly kind: 'you' }
  | { readonly kind: 'person'; readonly id: string; readonly name: string }
  | { readonly kind: 'unknown' };

export interface TrashItem {
  readonly id: string;
  readonly rootId: string;
  readonly name: string;
  readonly isFolder: boolean;
  readonly bytes: number;
  readonly deletedAt: number;
  readonly daysLeft: number;
  readonly kept: number;
  readonly folders: readonly string[];
  readonly deleter: Deleter;
}

export interface TrashTotals {
  readonly count: number;
  readonly bytes: number;
}

const WEEK_DAYS = 7;
const DAYS_IN_MONTH = 30.44;
const DAYS_AS_DAYS = 14;
const DAYS_AS_WEEKS = 60;

export function deleterOf(deletedBy: string | null, people: TrashPeople): Deleter {
  if (deletedBy === null) return { kind: 'unknown' };
  if (deletedBy === people.me) return { kind: 'you' };
  const name = people.names.get(deletedBy);
  return name === undefined ? { kind: 'unknown' } : { kind: 'person', id: deletedBy, name };
}

export function deleterName(deleter: Deleter): string {
  if (deleter.kind === 'you') return 'You';
  return deleter.kind === 'person' ? deleter.name : 'Someone';
}

export function trashItemOf(entry: DriveTrashEntry, today: string, people: TrashPeople): TrashItem {
  const day = localDayKey(entry.deletedAt);
  const purgeDay = localDayKey(entry.purgeAt);
  const daysLeft = Math.max(0, daysBetween(today, purgeDay));
  const span = Math.max(1, daysBetween(day, purgeDay));
  return {
    id: entry.itemId,
    rootId: entry.rootId,
    name: entry.name,
    isFolder: entry.isFolder,
    bytes: entry.bytes,
    deletedAt: Date.parse(entry.deletedAt),
    daysLeft,
    kept: Math.min(1, daysLeft / span),
    folders: entry.originalRelPath.split('/').slice(0, -1),
    deleter: deleterOf(entry.deletedBy, people),
  };
}

export function trashItemsOf(
  entries: readonly DriveTrashEntry[],
  today: string,
  people: TrashPeople,
): readonly TrashItem[] {
  return entries
    .map((entry) => trashItemOf(entry, today, people))
    .sort((left, right) => right.deletedAt - left.deletedAt);
}

export function totalsOf(items: readonly TrashItem[]): TrashTotals {
  return { count: items.length, bytes: items.reduce((sum, item) => sum + item.bytes, 0) };
}

export function itemsText(total: number): string {
  return total === 1 ? '1 item' : `${count(total)} items`;
}

export function totalsText(totals: TrashTotals): string {
  return `${itemsText(totals.count)} · ${bytes(totals.bytes)}`;
}

export function wasInOf(item: TrashItem, rootLabel: string | null): string {
  return [...(rootLabel === null ? [] : [rootLabel]), ...item.folders].join(' › ');
}

export function sizeText(item: TrashItem): string {
  return item.isFolder ? '—' : bytes(item.bytes);
}

interface LeaveUnit {
  readonly value: number;
  readonly long: string;
  readonly short: string;
}

function leaveUnitOf(daysLeft: number): LeaveUnit {
  if (daysLeft < DAYS_AS_DAYS) return { value: daysLeft, long: 'day', short: 'day' };
  if (daysLeft < DAYS_AS_WEEKS) {
    return { value: Math.round(daysLeft / WEEK_DAYS), long: 'week', short: 'wk' };
  }
  return { value: Math.round(daysLeft / DAYS_IN_MONTH), long: 'month', short: 'mo' };
}

export function leavesText(daysLeft: number, compact: boolean): string {
  if (daysLeft === 0) return 'Today';
  const unit = leaveUnitOf(daysLeft);
  if (compact && unit.short !== unit.long) return `${count(unit.value)} ${unit.short}`;
  return plural(unit.value, unit.long);
}

export function rowLabelOf(item: TrashItem, wasIn: string): string {
  const who = deleterName(item.deleter);
  const leaves =
    item.daysLeft === 0
      ? 'leaves for good today'
      : `leaves for good in ${plural(item.daysLeft, 'day')}`;
  return joinParts([
    item.name,
    wasIn === '' ? null : `was in ${wasIn}`,
    `deleted by ${who === 'You' ? 'you' : who}`,
    item.isFolder ? null : bytes(item.bytes),
    leaves,
  ]);
}

export function monthLabel(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const name = monthShort(new Date(year, month - 1, 1).getTime());
  return month === 1 ? `${name} ${String(year)}` : name;
}
