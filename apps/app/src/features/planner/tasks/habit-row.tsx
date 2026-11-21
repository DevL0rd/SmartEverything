import type { PlannerOccurrenceRow } from '@smarteverything/domain';
import { memo, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Card } from '../../../components/card';
import { CalendarHeatmap } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { localDayKey, shortDate, startOfDayKey } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { usePlannerOccurrences } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { useItemPress } from '../item/item-menu-host';
import {
  habitEntriesOf,
  habitHeatOf,
  habitStreakOf,
  habitWeeksOf,
  heatWindowOf,
  occurrenceDayOf,
  occurrencesByItem,
  repeatWordsOf,
  streakWordsOf,
} from './habits';
import { TaskCheck, useTaskActions } from './task-check';
import type { TaskEntry, TaskFilter } from './task-grouping';
import { AddTaskAction } from './task-list';

const CELL = 10;
const CELL_GAP = 3;
const NO_OCCURRENCES: readonly PlannerOccurrenceRow[] = [];
const HEAD_ROOM = 220;
const SIDE_MIN = 560;

function weeksIn(width: number): number {
  return Math.max(1, Math.floor((width + CELL_GAP) / (CELL + CELL_GAP)));
}

function fitOf(width: number): number {
  return weeksIn(width >= SIDE_MIN ? width - HEAD_ROOM : width);
}

function sinceOf(entry: TaskEntry): string {
  return localDayKey(entry.item.created_at);
}

function useDeviceLabel(entry: TaskEntry): string | null {
  const attached = entry.item.attachments.find((attachment) => attachment.kind === 'device');
  const device = useRow('devices', attached?.kind === 'device' ? attached.deviceId : null);
  return device?.label ?? null;
}

function todayOccurrenceOf(
  occurrences: readonly PlannerOccurrenceRow[],
  today: string,
): PlannerOccurrenceRow | null {
  return (
    occurrences.find(
      (row) => row.status !== 'missed' && occurrenceDayOf(row.occurrence_key) === today,
    ) ?? null
  );
}

function shownEntryOf(entry: TaskEntry, settled: PlannerOccurrenceRow | null): TaskEntry {
  if (entry.occurrenceKey !== null || settled === null) return entry;
  return {
    ...entry,
    occurrenceKey: settled.occurrence_key,
    open: false,
    done: settled.status === 'done',
  };
}

const TODAY_WORDS: Readonly<Record<PlannerOccurrenceRow['status'], string>> = {
  done: 'Done today',
  skipped: 'Skipped today',
  missed: 'Missed today',
};

function todayWordsOf(entry: TaskEntry, settled: PlannerOccurrenceRow | null): string | null {
  if (entry.occurrenceKey !== null) return null;
  return settled === null ? 'Not due today' : TODAY_WORDS[settled.status];
}

function HabitHead({
  entry,
  occurrences,
  today,
}: {
  readonly entry: TaskEntry;
  readonly occurrences: readonly PlannerOccurrenceRow[];
  readonly today: string;
}): ReactNode {
  const device = useDeviceLabel(entry);
  const touch = useIdiom() === 'touch';
  const press = useItemPress(entry.item.id, entry.occurrenceKey);
  const settled = todayOccurrenceOf(occurrences, today);
  const shown = shownEntryOf(entry, settled);
  const actions = useTaskActions(shown);
  const repeat = entry.item.rrule === null ? 'Repeats' : repeatWordsOf(entry.item.rrule);
  const words = [repeat, device, todayWordsOf(entry, settled)].filter((part) => part !== null);
  return (
    <View className="flex-row items-center gap-3">
      <TaskCheck entry={shown} actions={actions} />
      <Interactive
        {...press.open}
        onLongPress={press.onLongPress}
        onContextMenu={press.onContextMenu}
        label={entry.item.title}
        className={cn('min-w-0 flex-1 justify-center rounded-sm', touch && 'min-h-11')}
        layerClassName="rounded-sm"
      >
        <View className="flex-row items-center gap-1.5">
          <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
            {entry.item.title}
          </Text>
          {entry.item.completion.kind === 'signal' ? (
            <Icon name="zap" size={12} tone="variant" />
          ) : null}
        </View>
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {words.join(' · ')}
        </Text>
        {press.menu}
      </Interactive>
      <StreakMark occurrences={occurrences} />
    </View>
  );
}

function StreakMark({
  occurrences,
}: {
  readonly occurrences: readonly PlannerOccurrenceRow[];
}): ReactNode {
  const streak = habitStreakOf(occurrences);
  return (
    <View
      accessible
      accessibilityLabel={streakWordsOf(streak)}
      className="flex-row items-center gap-1"
    >
      <Icon name="flame" size={16} tone={streak.current === 0 ? 'faint' : 'primary'} />
      <Text variant="label" className="tabular">
        {String(streak.current)}
      </Text>
    </View>
  );
}

function gridPixelsOf(weeks: number): number {
  return weeks * (CELL + CELL_GAP) - CELL_GAP;
}

function gridWidthOf(weeks: number): ViewStyle {
  return { width: gridPixelsOf(weeks) };
}

interface HabitRowProps {
  readonly entry: TaskEntry;
  readonly occurrences: readonly PlannerOccurrenceRow[];
  readonly today: string;
  readonly back: number;
  readonly onFit: (weeks: number) => void;
}

export const HabitRow = memo(function HabitRow({
  entry,
  occurrences,
  today,
  back,
  onFit,
}: HabitRowProps): ReactNode {
  const [width, setWidth] = useState(0);
  const end = heatWindowOf(today, 1, back).end;
  const since = sinceOf(entry);
  const age = habitWeeksOf(since, end);
  const side = width >= SIDE_MIN || gridPixelsOf(age) + HEAD_ROOM <= width;
  const fit = weeksIn(side ? width - HEAD_ROOM : width);
  const window = heatWindowOf(today, Math.min(fit, age), back);
  return (
    <Card padding="none" className="p-3">
      <View
        className={side ? 'flex-row items-center gap-4' : 'gap-3'}
        onLayout={(event: LayoutChangeEvent) => {
          const measured = event.nativeEvent.layout.width;
          setWidth(measured);
          onFit(fitOf(measured));
        }}
      >
        <View className={cn(side && 'min-w-0 flex-1')}>
          <HabitHead entry={entry} occurrences={occurrences} today={today} />
        </View>
        {width === 0 ? null : (
          <View className={cn(!side && 'items-end')}>
            <View style={gridWidthOf(window.weeks)}>
              <CalendarHeatmap
                days={habitHeatOf({ occurrences, since, window })}
                today={today}
                label={`${entry.item.title} done`}
                unit="done"
              />
            </View>
          </View>
        )}
      </View>
    </Card>
  );
});

function oldestWeeks(habits: readonly TaskEntry[], today: string): number {
  return habits.reduce((most, entry) => Math.max(most, habitWeeksOf(sinceOf(entry), today)), 1);
}

function WeekPager({
  today,
  back,
  limit,
  onBack,
}: {
  readonly today: string;
  readonly back: number;
  readonly limit: number;
  readonly onBack: (back: number) => void;
}): ReactNode {
  if (limit === 0 && back === 0) return null;
  return (
    <View className="flex-row items-center gap-1">
      <Text variant="caption" tone="variant" className="min-w-0 flex-1" numberOfLines={1}>
        {back === 0
          ? 'Up to today'
          : `Up to ${shortDate(startOfDayKey(heatWindowOf(today, 1, back).end))}`}
      </Text>
      <IconButton
        icon="chevronLeft"
        label="Earlier weeks"
        disabled={back >= limit}
        onPress={() => {
          onBack(back + 1);
        }}
      />
      <IconButton
        icon="chevronRight"
        label="Later weeks"
        disabled={back === 0}
        onPress={() => {
          onBack(back - 1);
        }}
      />
    </View>
  );
}

export interface TaskHabitsProps {
  readonly entries: readonly TaskEntry[];
  readonly today: string;
  readonly filter: TaskFilter;
}

export function TaskHabits({ entries, today, filter }: TaskHabitsProps): ReactNode {
  const { person } = usePlannerFrame();
  const byItem = occurrencesByItem(usePlannerOccurrences(person));
  const [back, setBack] = useState(0);
  const [fit, setFit] = useState(0);
  const habits = habitEntriesOf(entries, filter, today);
  if (habits.length === 0) {
    return (
      <EmptyState
        icon="flame"
        title="No habits yet"
        body="Tasks that repeat show up here with their streak."
        action={<AddTaskAction />}
      />
    );
  }
  const limit = fit === 0 ? 0 : Math.max(0, oldestWeeks(habits, today) - fit);
  return (
    <View className="gap-3">
      <WeekPager today={today} back={Math.min(back, limit)} limit={limit} onBack={setBack} />
      {habits.map((entry) => (
        <HabitRow
          key={entry.item.id}
          entry={entry}
          occurrences={byItem.get(entry.item.id) ?? NO_OCCURRENCES}
          today={today}
          back={Math.min(back, limit)}
          onFit={setFit}
        />
      ))}
    </View>
  );
}
