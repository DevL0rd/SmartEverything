import type { PlannerItemRow, PlannerOccurrenceRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Section } from '../../../components/section';
import { Text } from '../../../components/text';
import type { TimeOfDay } from '../../../components/time-field';
import { cn } from '../../../design/cn';
import type { ItemChanges } from './repeat-scope-bar';
import { clock, localDayKey, longDate, shiftDay } from '../../../format/time';

export interface FieldsToday {
  readonly now: number;
  readonly timeZone: string;
}

export function dayLabelOf(day: string, today: FieldsToday): string {
  const key = localDayKey(today.now, today.timeZone);
  if (day === key) return 'Today';
  if (day === shiftDay(key, 1)) return 'Tomorrow';
  if (day === shiftDay(key, -1)) return 'Yesterday';
  return longDate(`${day}T12:00:00Z`, 'UTC');
}

function spanOf(start: string, end: string | null): string {
  if (!start.includes('T')) return end === null || end === start ? '' : ` to ${end}`;
  const from = start.slice(11, 16);
  if (end === null) return ` ${from}`;
  const sameDay = end.slice(0, 10) === start.slice(0, 10);
  return ` ${from} to ${sameDay ? '' : `${end.slice(0, 10)} `}${end.slice(11, 16)}`;
}

export function whenTextOf(item: PlannerItemRow, today: FieldsToday): string {
  const start = item.start_local;
  if (start !== null) {
    return `${dayLabelOf(start.slice(0, 10), today)}${spanOf(start, item.end_local)}`;
  }
  if (item.due_at !== null) {
    const day = dayLabelOf(localDayKey(item.due_at, today.timeZone), today);
    return `${day} ${clock(item.due_at, today.timeZone)}`;
  }
  return item.due_date === null ? 'No date' : dayLabelOf(item.due_date, today);
}

const MINUTE_MS = 60_000;

function localMs(value: string): number {
  return Date.parse(`${value.length === 16 ? `${value}:00` : value}Z`);
}

function localOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

function atTime(date: string, time: TimeOfDay): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date}T${pad(time.hour)}:${pad(time.minute)}:00`;
}

export function timeOfLocal(value: string): TimeOfDay {
  return { hour: Number(value.slice(11, 13)), minute: Number(value.slice(14, 16)) };
}

export function withStartTime(item: PlannerItemRow, time: TimeOfDay): ItemChanges {
  const start = item.start_local;
  if (start === null) return {};
  const next = atTime(start.slice(0, 10), time);
  if (item.end_local === null) return { start_local: next };
  const length = localMs(item.end_local) - localMs(start);
  return { start_local: next, end_local: localOf(localMs(next) + length) };
}

export function withEndTime(item: PlannerItemRow, time: TimeOfDay): ItemChanges {
  const start = item.start_local;
  if (start === null) return {};
  const same = atTime(start.slice(0, 10), time);
  const end = localMs(same) < localMs(start) ? localOf(localMs(same) + 1440 * MINUTE_MS) : same;
  return { end_local: end };
}

export type HistoryStatus = PlannerOccurrenceRow['status'];

export interface HistoryEntry {
  readonly key: string;
  readonly status: HistoryStatus;
  readonly at: number;
  readonly day: string;
  readonly summary: string | null;
}

export interface ItemHistoryModel {
  readonly entries: readonly HistoryEntry[];
  readonly done: number;
  readonly latest: HistoryEntry | null;
}

function momentOf(row: PlannerOccurrenceRow): number {
  const key = row.occurrence_key;
  if (key !== 'single') return Date.parse(key.length === 10 ? `${key}T12:00:00Z` : key);
  return row.completed_at === null ? 0 : Date.parse(row.completed_at);
}

function dayOf(row: PlannerOccurrenceRow, at: number, today: FieldsToday): string {
  const key = row.occurrence_key;
  return dayLabelOf(key.length === 10 ? key : localDayKey(at, today.timeZone), today);
}

export function itemHistoryOf(
  occurrences: readonly PlannerOccurrenceRow[],
  itemId: string,
  today: FieldsToday,
): ItemHistoryModel {
  const entries = occurrences
    .filter((row) => row.item_id === itemId)
    .map((row) => {
      const at = momentOf(row);
      return {
        key: row.occurrence_key,
        status: row.status,
        at,
        day: dayOf(row, at, today),
        summary: row.evidence?.summary ?? null,
      };
    })
    .sort((left, right) => left.at - right.at);
  const done = entries.filter((entry) => entry.status === 'done');
  return { entries, done: done.length, latest: done[done.length - 1] ?? null };
}

const CELL: Readonly<Record<HistoryStatus, string>> = {
  done: 'bg-positive',
  missed: 'bg-critical',
  skipped: 'border border-outline bg-surface-3',
};

const WORD: Readonly<Record<HistoryStatus, string>> = {
  done: 'done',
  missed: 'missed',
  skipped: 'skipped',
};

export function historySpokenOf(model: ItemHistoryModel): string {
  const counts = (['done', 'missed', 'skipped'] as const)
    .map((status) => ({
      status,
      count: model.entries.filter((entry) => entry.status === status).length,
    }))
    .filter(({ count }) => count > 0)
    .map(({ status, count }) => `${String(count)} ${WORD[status]}`);
  return counts.join(', ');
}

function LatestLine({ latest }: { readonly latest: HistoryEntry | null }): ReactNode {
  if (latest === null) return null;
  return (
    <Text variant="callout" tone="variant" className="tabular">
      {latest.summary === null ? `Last done ${latest.day}` : `${latest.day} · ${latest.summary}`}
    </Text>
  );
}

export function ItemHistory({ model }: { readonly model: ItemHistoryModel }): ReactNode {
  if (model.entries.length === 0) return null;
  return (
    <Section
      title="History"
      caption={`${String(model.done)} of ${String(model.entries.length)} done`}
    >
      <View className="gap-2 px-4">
        <View
          accessible
          accessibilityLabel={historySpokenOf(model)}
          className="flex-row flex-wrap gap-1"
        >
          {model.entries.map((entry) => (
            <View key={entry.key} className={cn('h-6 w-2.5 rounded-xs', CELL[entry.status])} />
          ))}
        </View>
        <LatestLine latest={model.latest} />
      </View>
    </Section>
  );
}
