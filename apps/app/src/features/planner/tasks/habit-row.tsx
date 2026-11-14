import type { PlannerOccurrenceRow } from '@smarteverything/domain';
import { memo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { CalendarHeatmap } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { daysBetween, localDayKey, shortDate, startOfDayKey } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { usePlannerOccurrences } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { useItemPress } from '../item/item-menu-host';
import {
  habitEntriesOf,
  habitHeatOf,
  habitStreakOf,
  heatWindowOf,
  occurrencesByItem,
  repeatWordsOf,
  streakWordsOf,
} from './habits';
import type { TaskEntry, TaskFilter } from './task-grouping';

const CELL = 10;
const CELL_GAP = 3;
const WEEK = 7;
const NO_OCCURRENCES: readonly PlannerOccurrenceRow[] = [];

function weeksIn(width: number): number {
  return Math.max(1, Math.floor((width + CELL_GAP) / (CELL + CELL_GAP)));
}

function sinceOf(entry: TaskEntry): string {
  return localDayKey(entry.item.created_at);
}

function useDeviceLabel(entry: TaskEntry): string | null {
  const attached = entry.item.attachments.find((attachment) => attachment.kind === 'device');
  const device = useRow('devices', attached?.kind === 'device' ? attached.deviceId : null);
  return device?.label ?? null;
}

function HabitHead({
  entry,
  occurrences,
}: {
  readonly entry: TaskEntry;
  readonly occurrences: readonly PlannerOccurrenceRow[];
}): ReactNode {
  const device = useDeviceLabel(entry);
  const streak = habitStreakOf(occurrences);
  const repeat = entry.item.rrule === null ? 'Repeats' : repeatWordsOf(entry.item.rrule);
  const subtitle = device === null ? repeat : `${repeat} · ${device}`;
  const press = useItemPress(entry.item.id, entry.occurrenceKey);
  return (
    <View className="flex-row items-center gap-3">
      <Icon
        name={entry.item.completion.kind === 'signal' ? 'zap' : 'repeat'}
        size={20}
        tone="variant"
      />
      <Interactive
        {...press.open}
        onLongPress={press.onLongPress}
        onContextMenu={press.onContextMenu}
        label={entry.item.title}
        className="min-w-0 flex-1 rounded-sm"
        layerClassName="rounded-sm"
      >
        <Text variant="label" numberOfLines={1}>
          {entry.item.title}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {subtitle}
        </Text>
        {press.menu}
      </Interactive>
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
    </View>
  );
}

interface HabitRowProps {
  readonly entry: TaskEntry;
  readonly occurrences: readonly PlannerOccurrenceRow[];
  readonly today: string;
  readonly back: number;
}

export const HabitRow = memo(function HabitRow({
  entry,
  occurrences,
  today,
  back,
}: HabitRowProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const window = heatWindowOf(today, weeksIn(width), back);
  return (
    <Card padding="none" className="gap-3 p-3">
      <HabitHead entry={entry} occurrences={occurrences} />
      <View onLayout={onLayout}>
        {width === 0 ? null : (
          <CalendarHeatmap
            days={habitHeatOf({ occurrences, since: sinceOf(entry), window })}
            today={today}
            label={`${entry.item.title} done`}
            unit="done"
          />
        )}
      </View>
    </Card>
  );
});

function oldestBack(habits: readonly TaskEntry[], today: string): number {
  const oldest = habits.reduce(
    (age, entry) => Math.max(age, daysBetween(sinceOf(entry), today)),
    0,
  );
  return Math.floor(oldest / WEEK);
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
  const habits = habitEntriesOf(entries, filter, today);
  if (habits.length === 0) {
    return (
      <EmptyState
        icon="flame"
        title="No habits yet"
        body="Tasks that repeat show up here with their streak."
      />
    );
  }
  return (
    <View className="gap-3">
      <WeekPager today={today} back={back} limit={oldestBack(habits, today)} onBack={setBack} />
      {habits.map((entry) => (
        <HabitRow
          key={entry.item.id}
          entry={entry}
          occurrences={byItem.get(entry.item.id) ?? NO_OCCURRENCES}
          today={today}
          back={back}
        />
      ))}
    </View>
  );
}
