import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { useAreaWidth } from '../../../design/size-class';
import { useMinuteOf } from '../../../store/clock';
import { frameLayoutOf } from '../frame/sections';
import { useItemPress } from '../item/item-menu-host';
import { matrixOf, type QuadrantKey, type QuadrantModel } from './matrix-model';
import { TaskCheck, useTaskActions } from './task-card';
import { dueLabelOf, isOverdue, type TaskEntry, type TaskFilter } from './task-grouping';

const TITLE_TONE: Readonly<Record<QuadrantKey, Tone>> = {
  now: 'critical',
  plan: 'primary',
  fast: 'default',
  later: 'variant',
};

const EMPTY_COPY: Readonly<Record<QuadrantKey, string>> = {
  now: 'Nothing urgent and important',
  plan: 'Nothing to plan',
  fast: 'Nothing quick to clear',
  later: 'Nothing for later',
};

const MatrixTask = memo(function MatrixTask({
  entry,
  today,
}: {
  readonly entry: TaskEntry;
  readonly today: string;
}): ReactNode {
  const actions = useTaskActions(entry);
  const overdue = useMinuteOf((now) => isOverdue(entry, now, today));
  const press = useItemPress(entry.item.id, entry.occurrenceKey);
  return (
    <View className="flex-row items-start gap-1.5">
      <TaskCheck entry={entry} onDone={actions.done} />
      <Interactive
        {...press.open}
        onLongPress={press.onLongPress}
        onContextMenu={press.onContextMenu}
        label={entry.item.title}
        className="min-h-7 min-w-0 flex-1 justify-center rounded-sm py-0.5"
        layerClassName="rounded-sm"
      >
        <Text variant="footnote" numberOfLines={2}>
          {entry.item.title}
        </Text>
        <Text variant="caption" tone={overdue ? 'critical' : 'variant'} className="tabular">
          {dueLabelOf(entry, today)}
        </Text>
        {press.menu}
      </Interactive>
    </View>
  );
});

function Quadrant({
  quadrant,
  today,
}: {
  readonly quadrant: QuadrantModel;
  readonly today: string;
}): ReactNode {
  return (
    <Card
      tone={quadrant.key === 'now' ? 'critical' : 'default'}
      padding="none"
      className="min-h-60 min-w-0 flex-1 p-3"
    >
      <View className="gap-2">
        <View className="flex-row items-start gap-2">
          <View className="min-w-0 flex-1">
            <Text variant="label" tone={TITLE_TONE[quadrant.key]} accessibilityRole="header">
              {quadrant.title}
            </Text>
            <Text variant="caption" tone="variant">
              {quadrant.hint}
            </Text>
          </View>
          <Text variant="caption" tone="variant" className="tabular">
            {String(quadrant.entries.length)}
          </Text>
        </View>
        {quadrant.entries.length === 0 ? (
          <Text variant="caption" tone="variant" className="pt-2">
            {EMPTY_COPY[quadrant.key]}
          </Text>
        ) : (
          quadrant.entries.map((entry) => (
            <MatrixTask key={entry.item.id} entry={entry} today={today} />
          ))
        )}
      </View>
    </Card>
  );
}

export interface TaskMatrixProps {
  readonly entries: readonly TaskEntry[];
  readonly today: string;
  readonly filter: TaskFilter;
}

export function TaskMatrix({ entries, today, filter }: TaskMatrixProps): ReactNode {
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const quadrants = matrixOf({ entries, filter, today });
  const gap = compact ? 'gap-2' : 'gap-grid-gap';
  return (
    <View className={gap}>
      {[quadrants.slice(0, 2), quadrants.slice(2)].map((pair) => (
        <View key={pair.map((quadrant) => quadrant.key).join()} className={cn('flex-row', gap)}>
          {pair.map((quadrant) => (
            <Quadrant key={quadrant.key} quadrant={quadrant} today={today} />
          ))}
        </View>
      ))}
    </View>
  );
}
