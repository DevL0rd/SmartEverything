import type { DriveTrashEntry } from '@smarteverything/domain';
import { bytes, count } from '../../../format/number';
import { daysBetween, localDayKey, monthShort } from '../../../format/time';

export interface DeletedPeople {
  readonly me: string | null;
  readonly names: ReadonlyMap<string, string>;
}

export interface DeletedItem {
  readonly id: string;
  readonly name: string;
  readonly isFolder: boolean;
  readonly bytes: number;
  readonly deletedAt: number;
  readonly day: string;
  readonly purgeDay: string;
  readonly daysLeft: number;
  readonly kept: number;
  readonly critical: boolean;
  readonly who: string | null;
}

export interface DeletedDay {
  readonly day: string;
  readonly items: readonly DeletedItem[];
}

export interface DeletedTotals {
  readonly count: number;
  readonly bytes: number;
}

export interface LeavingMonth {
  readonly key: string;
  readonly count: number;
  readonly critical: boolean;
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function whoOf(deletedBy: string | null, people: DeletedPeople): string | null {
  if (deletedBy === null) return null;
  if (deletedBy === people.me) return 'You';
  return people.names.get(deletedBy) ?? null;
}

export function deletedItemOf(
  entry: DriveTrashEntry,
  today: string,
  people: DeletedPeople,
): DeletedItem {
  const day = localDayKey(entry.deletedAt);
  const purgeDay = localDayKey(entry.purgeAt);
  const daysLeft = Math.max(0, daysBetween(today, purgeDay));
  const span = Math.max(1, daysBetween(day, purgeDay));
  return {
    id: entry.itemId,
    name: entry.name,
    isFolder: entry.isFolder,
    bytes: entry.bytes,
    deletedAt: Date.parse(entry.deletedAt),
    day,
    purgeDay,
    daysLeft,
    kept: Math.min(1, daysLeft / span),
    critical: monthOf(purgeDay) <= monthOf(today),
    who: whoOf(entry.deletedBy, people),
  };
}

export function deletedItemsOf(
  entries: readonly DriveTrashEntry[],
  today: string,
  people: DeletedPeople,
): readonly DeletedItem[] {
  return entries
    .map((entry) => deletedItemOf(entry, today, people))
    .sort((left, right) => right.deletedAt - left.deletedAt);
}

export function deletedDaysOf(items: readonly DeletedItem[]): readonly DeletedDay[] {
  const days: { readonly day: string; readonly items: DeletedItem[] }[] = [];
  for (const item of items) {
    const last = days.at(-1);
    if (last?.day === item.day) last.items.push(item);
    else days.push({ day: item.day, items: [item] });
  }
  return days;
}

export function pickedOf(
  items: readonly DeletedItem[],
  ids: ReadonlySet<string>,
): readonly DeletedItem[] {
  return items.filter((item) => ids.has(item.id));
}

export function totalsOf(items: readonly DeletedItem[]): DeletedTotals {
  return { count: items.length, bytes: items.reduce((sum, item) => sum + item.bytes, 0) };
}

function nextMonth(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12
    ? `${String(year + 1)}-01`
    : `${String(year)}-${String(month + 1).padStart(2, '0')}`;
}

export function leavingMonthsOf(
  items: readonly DeletedItem[],
  today: string,
): readonly LeavingMonth[] {
  const first = monthOf(today);
  const counts = new Map<string, number>();
  let last = first;
  for (const item of items) {
    const month = monthOf(item.purgeDay) < first ? first : monthOf(item.purgeDay);
    counts.set(month, (counts.get(month) ?? 0) + 1);
    if (month > last) last = month;
  }
  if (counts.size === 0) return [];
  const months: LeavingMonth[] = [];
  for (let key = first; key <= last; key = nextMonth(key)) {
    months.push({ key, count: counts.get(key) ?? 0, critical: key === first });
  }
  return months;
}

export function monthLabel(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const name = monthShort(new Date(year, month - 1, 1).getTime());
  return month === 1 ? `${name} ${String(year)}` : name;
}

export function leavingLabel(months: readonly LeavingMonth[]): string {
  const parts = months
    .filter((month) => month.count > 0)
    .map((month) => `${count(month.count)} in ${monthLabel(month.key)}`);
  return `Leaving for good per month: ${parts.join(', ')}`;
}

export function itemsText(total: number): string {
  return total === 1 ? '1 item' : `${count(total)} items`;
}

export function totalsText(totals: DeletedTotals): string {
  return `${itemsText(totals.count)} · ${bytes(totals.bytes)}`;
}

export function leftText(daysLeft: number): string {
  return daysLeft === 0 ? 'Today' : `${count(daysLeft)} d`;
}

export function tileLabelOf(item: DeletedItem): string {
  const leaves =
    item.daysLeft === 0
      ? 'leaves for good today'
      : `leaves for good in ${item.daysLeft === 1 ? '1 day' : `${count(item.daysLeft)} days`}`;
  const who = item.who === null ? null : `deleted by ${item.who === 'You' ? 'you' : item.who}`;
  return [item.name, who, leaves].filter((part): part is string => part !== null).join(', ');
}
