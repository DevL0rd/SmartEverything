import {
  PLANNER_OCCURRENCE_SINGLE,
  type PlannerItemRow,
  type PlannerOccurrenceRow,
} from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Section } from '../../../components/section';
import { Text } from '../../../components/text';
import type { TimeOfDay } from '../../../components/time-field';
import { cn } from '../../../design/cn';
import type { ItemChanges } from './repeat-scope-bar';
import type { ClockFormat } from '../../../format/clock-text';
import {
  clock24,
  daysBetween,
  localDayKey,
  longDate,
  shiftDay,
  shortDate,
  zonedInstant,
} from '../../../format/time';

export interface FieldsToday {
  readonly now: number;
  readonly timeZone: string;
  readonly format: ClockFormat;
}

export function dayLabelOf(day: string, today: FieldsToday): string {
  const key = localDayKey(today.now, today.timeZone);
  if (day === key) return 'Today';
  if (day === shiftDay(key, 1)) return 'Tomorrow';
  if (day === shiftDay(key, -1)) return 'Yesterday';
  return longDate(`${day}T12:00:00Z`, 'UTC');
}

function spanOf(start: string, end: string | null, format: ClockFormat): string {
  if (!start.includes('T')) return end === null || end === start ? '' : ` to ${end}`;
  const from = format.text(start.slice(11, 16));
  if (end === null) return ` ${from}`;
  const sameDay = end.slice(0, 10) === start.slice(0, 10);
  return ` ${from} to ${sameDay ? '' : `${end.slice(0, 10)} `}${format.text(end.slice(11, 16))}`;
}

export function whenTextOf(item: PlannerItemRow, today: FieldsToday): string {
  const start = item.start_local;
  if (start !== null) {
    return `${dayLabelOf(start.slice(0, 10), today)}${spanOf(start, item.end_local, today.format)}`;
  }
  if (item.due_at !== null) {
    const day = dayLabelOf(localDayKey(item.due_at, today.timeZone), today);
    return `${day} ${today.format.instant(item.due_at, today.timeZone)}`;
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

export function occurrenceDayOf(occurrenceKey: string | null, timeZone: string): string | null {
  if (occurrenceKey === null || occurrenceKey === PLANNER_OCCURRENCE_SINGLE) return null;
  return occurrenceKey.length === 10 ? occurrenceKey : localDayKey(occurrenceKey, timeZone);
}

function shiftLocal(value: string, days: number): string {
  if (days === 0) return value;
  if (value.length === 10) return shiftDay(value, days);
  return localOf(localMs(value) + days * 1440 * MINUTE_MS);
}

function shiftedChanges(changes: ItemChanges, days: number): ItemChanges {
  const start = changes.start_local;
  const end = changes.end_local;
  return {
    ...changes,
    ...(start === undefined || start === null ? {} : { start_local: shiftLocal(start, days) }),
    ...(end === undefined || end === null ? {} : { end_local: shiftLocal(end, days) }),
  };
}

function seriesOffsetOf(item: PlannerItemRow, day: string | null): number {
  const start = item.start_local;
  if (day === null || start === null) return 0;
  return daysBetween(start.slice(0, 10), day);
}

export function itemAtDay(item: PlannerItemRow, day: string | null): PlannerItemRow {
  const days = seriesOffsetOf(item, day);
  if (days === 0 || item.start_local === null) return item;
  return {
    ...item,
    start_local: shiftLocal(item.start_local, days),
    end_local: item.end_local === null ? null : shiftLocal(item.end_local, days),
  };
}

export function seriesChangesOf(
  changes: ItemChanges,
  item: PlannerItemRow,
  day: string | null,
): ItemChanges {
  const days = seriesOffsetOf(item, day);
  return days === 0 ? changes : shiftedChanges(changes, -days);
}

export function withStartDay(item: PlannerItemRow, day: string): ItemChanges {
  const start = item.start_local;
  if (start === null) return {};
  const days = daysBetween(start.slice(0, 10), day);
  return shiftedChanges(
    { start_local: start, ...(item.end_local === null ? {} : { end_local: item.end_local }) },
    days,
  );
}

function minuteOfDayIn(moment: string, timeZone: string): number {
  const text = clock24(moment, timeZone);
  return Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
}

export function withDueDay(
  item: PlannerItemRow,
  day: string | null,
  timeZone: string,
): ItemChanges {
  if (day === null) return { due_date: null, due_at: null };
  if (item.due_at === null) return { due_date: day };
  const at = zonedInstant(day, minuteOfDayIn(item.due_at, timeZone), timeZone);
  return { due_at: new Date(at).toISOString() };
}

export function dueDayOf(item: PlannerItemRow, timeZone: string): string | null {
  if (item.due_at !== null) return localDayKey(item.due_at, timeZone);
  return item.due_date;
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

function countOf(model: ItemHistoryModel, status: HistoryStatus): number {
  return model.entries.filter((entry) => entry.status === status).length;
}

const STATUSES = ['done', 'missed', 'skipped'] as const;

const LEGEND: Readonly<Record<HistoryStatus, string>> = {
  done: 'Done',
  missed: 'Missed',
  skipped: 'Skipped',
};

function ReadoutLine({
  latest,
  focused,
}: {
  readonly latest: HistoryEntry | null;
  readonly focused: HistoryEntry | null;
}): ReactNode {
  if (focused !== null) {
    const what = focused.summary ?? WORD[focused.status];
    return (
      <Text variant="callout" className="tabular">
        {`${focused.day} · ${what}`}
      </Text>
    );
  }
  if (latest === null) return null;
  return (
    <Text variant="callout" tone="variant" className="tabular">
      {latest.summary === null ? `Last done ${latest.day}` : `${latest.day} · ${latest.summary}`}
    </Text>
  );
}

function Legend({ model }: { readonly model: ItemHistoryModel }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      {STATUSES.map((status) => (
        <View key={status} className="flex-row items-center gap-1.5">
          <View className={cn('size-2.5 rounded-xs', CELL[status])} />
          <Text variant="caption" tone="variant" className="tabular">
            {`${LEGEND[status]} ${String(countOf(model, status))}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Strip({
  model,
  focused,
  onFocus,
}: {
  readonly model: ItemHistoryModel;
  readonly focused: string | null;
  readonly onFocus: (key: string | null) => void;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={historySpokenOf(model)}
      onPointerLeave={() => {
        onFocus(null);
      }}
      className="flex-row gap-0.5"
    >
      {model.entries.map((entry) => (
        <View
          key={entry.key}
          onPointerEnter={() => {
            onFocus(entry.key);
          }}
          onPointerDown={() => {
            onFocus(entry.key);
          }}
          className="h-8 w-4 min-w-1.5 shrink justify-center"
        >
          <View
            className={cn(
              'h-6 rounded-xs',
              CELL[entry.status],
              focused === entry.key && 'h-8 outline-2 outline-focus',
            )}
          />
        </View>
      ))}
    </View>
  );
}

export function ItemHistory({ model }: { readonly model: ItemHistoryModel }): ReactNode {
  const [focused, setFocused] = useState<string | null>(null);
  const first = model.entries[0];
  const last = model.entries[model.entries.length - 1];
  if (first === undefined || last === undefined) return null;
  return (
    <Section
      title="History"
      caption={`${String(model.done)} of ${String(model.entries.length)} done`}
    >
      <View className="gap-2 px-4">
        <View className="max-w-full gap-1 self-start">
          <Strip model={model} focused={focused} onFocus={setFocused} />
          <View className="flex-row justify-between gap-4">
            <Text variant="caption" tone="faint" className="tabular">
              {shortDate(first.at)}
            </Text>
            <Text variant="caption" tone="faint" className="tabular">
              {shortDate(last.at)}
            </Text>
          </View>
        </View>
        <Legend model={model} />
        <ReadoutLine
          latest={model.latest}
          focused={model.entries.find((entry) => entry.key === focused) ?? null}
        />
      </View>
    </Section>
  );
}
