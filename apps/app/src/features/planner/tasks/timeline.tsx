import { background } from '@smarteverything/logging';
import { memo, useState, type ReactElement, type ReactNode } from 'react';
import { View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { EmptyState } from '../../../components/empty-state';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { VirtualList } from '../../../components/virtual-list';
import { cn } from '../../../design/cn';
import { useAreaWidth } from '../../../design/size-class';
import { selectionTick } from '../../../platform/haptics';
import { useMinute } from '../../../store/clock';
import { usePlannerCollections, usePlannerWrites } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { frameLayoutOf } from '../frame/sections';
import { LIST_DOT } from '../item/composer-tokens';
import { useItemPress } from '../item/item-menu-host';
import type { TaskEntry, TaskFilter } from './task-grouping';
import {
  BAR_SIZES,
  barClassOf,
  barLayoutOf,
  dropDayOf,
  dueChangeOf,
  fractionOf,
  sameTimelineRow,
  timelineDaysOf,
  timelineRowsOf,
  type BarLayout,
  type TimelineBar,
  type TimelineRow,
  type TimelineWindow,
} from './timeline-model';

const HANDLE = 16;

interface Geometry {
  readonly compact: boolean;
  readonly width: number;
  readonly window: TimelineWindow;
}

function useDueDrop(row: TimelineRow, window: TimelineWindow): (fraction: number) => void {
  const { person } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  return (fraction: number): void => {
    const changes = dueChangeOf(row.entry.item, dropDayOf(fraction, window));
    if (changes === null) return;
    selectionTick();
    background(
      writes.updateItem(row.entry.item, { changes }).catch((error: unknown) => {
        notify({ message: 'Couldn’t change the due date', error, tone: 'critical' });
      }),
      'planner.timeline_due_failed',
    );
  };
}

interface HandleProps {
  readonly row: TimelineRow;
  readonly geometry: Geometry;
  readonly right: number;
  readonly shift: SharedValue<number>;
}

function DueHandle({ row, geometry, right, shift }: HandleProps): ReactNode {
  const drop = useDueDrop(row, geometry.window);
  const width = geometry.width;
  const commit = (delta: number): void => {
    drop((right + delta) / width);
    shift.set(0);
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      shift.set(event.translationX);
    })
    .onEnd((event) => {
      scheduleOnRN(commit, event.translationX);
    });
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() }] }));
  const day = (by: number): number => ((by + 0.5) * width) / geometry.window.days;
  const onAction = (event: AccessibilityActionEvent): void => {
    const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const index = Math.round((right / width) * geometry.window.days) - 1 + step;
    drop(day(index) / width);
  };
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Due date of ${row.entry.item.title}: ${row.bar.label}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        style={[placeAt(right - HANDLE / 2), moved]}
        className="absolute bottom-0 top-0 w-4 cursor-ew-resize items-center justify-center"
      >
        <View className="h-3 w-1 rounded-full bg-on-surface-variant" />
      </Animated.View>
    </GestureDetector>
  );
}

function BarLabel({
  bar,
  inside,
}: {
  readonly bar: TimelineBar;
  readonly inside: boolean;
}): ReactNode {
  return (
    <Text
      variant="caption"
      tone={bar.tone === 'overdue' ? 'critical' : 'variant'}
      numberOfLines={1}
      className={cn('tabular', inside ? 'px-1.5' : 'px-1')}
    >
      {bar.label}
    </Text>
  );
}

function placeAt(left: number): { readonly left: number } {
  return { left };
}

function labelPlace(
  layout: BarLayout,
  width: number,
): { readonly left?: number; readonly right?: number } {
  return layout.side === 'before'
    ? { right: width - layout.left }
    : { left: layout.left + layout.span };
}

function Bar({
  row,
  geometry,
}: {
  readonly row: TimelineRow;
  readonly geometry: Geometry;
}): ReactNode {
  const { offline } = usePlannerFrame();
  const { bar } = row;
  const layout = barLayoutOf(bar, geometry.width);
  const shift = useSharedValue(0);
  const stretched = useAnimatedStyle(() => ({
    width: Math.max(BAR_SIZES.least, layout.span + shift.get()),
  }));
  return (
    <>
      <Animated.View
        style={[placeAt(layout.left), stretched]}
        className={cn(
          'absolute top-1.5 bottom-1.5 justify-center overflow-hidden rounded-xs border',
          barClassOf(row),
        )}
      >
        {layout.side === 'inside' ? <BarLabel bar={bar} inside /> : null}
      </Animated.View>
      {layout.side === 'inside' ? null : (
        <View
          style={labelPlace(layout, geometry.width)}
          className="absolute bottom-0 top-0 justify-center"
        >
          <BarLabel bar={bar} inside={false} />
        </View>
      )}
      {bar.draggable && !offline ? (
        <DueHandle row={row} geometry={geometry} right={layout.right} shift={shift} />
      ) : null}
    </>
  );
}

function DayLines({ geometry }: { readonly geometry: Geometry }): ReactNode {
  const step = geometry.width / geometry.window.days;
  return Array.from({ length: geometry.window.days }, (_, index) => (
    <View
      key={index}
      style={placeAt(index * step)}
      className="absolute bottom-0 top-0 w-px bg-outline-variant"
    />
  ));
}

function NowLine({
  now,
  geometry,
}: {
  readonly now: number;
  readonly geometry: Geometry;
}): ReactNode {
  const at = fractionOf(now, geometry.window);
  if (at < 0 || at > 1) return null;
  return (
    <View
      style={placeAt(at * geometry.width - 1)}
      className="absolute bottom-0 top-0 w-0.5 bg-primary"
    />
  );
}

const NAME_WIDTH = { compact: 'w-28', wide: 'w-56' } as const;

interface RowViewProps {
  readonly row: TimelineRow;
  readonly geometry: Geometry;
  readonly now: number;
}

const RowView = memo(function RowView({ row, geometry, now }: RowViewProps): ReactNode {
  const { entry, collection } = row;
  const press = useItemPress(entry.item.id, entry.occurrenceKey);
  return (
    <View
      className={cn(
        'flex-row border-x border-b border-outline-variant bg-surface-1',
        geometry.compact ? 'h-8' : 'h-9',
      )}
    >
      <Interactive
        {...press.open}
        onLongPress={press.onLongPress}
        onContextMenu={press.onContextMenu}
        label={entry.item.title}
        className={cn(
          'flex-row items-center gap-2 px-3',
          geometry.compact ? NAME_WIDTH.compact : NAME_WIDTH.wide,
        )}
      >
        {geometry.compact ? null : (
          <View
            className={cn(
              'size-2 rounded-full',
              collection === null ? 'bg-on-surface-faint' : LIST_DOT[collection.colour],
            )}
          />
        )}
        <Text
          variant={geometry.compact ? 'caption' : 'footnote'}
          tone={entry.done ? 'variant' : 'default'}
          numberOfLines={1}
          className="min-w-0 flex-1"
        >
          {entry.item.title}
        </Text>
        {press.menu}
      </Interactive>
      <View className="relative flex-1">
        {geometry.width === 0 ? null : (
          <>
            <DayLines geometry={geometry} />
            <NowLine now={now} geometry={geometry} />
            <Bar row={row} geometry={geometry} />
          </>
        )}
      </View>
    </View>
  );
});

function DayAxis({
  geometry,
  today,
  onWidth,
}: {
  readonly geometry: Geometry;
  readonly today: string;
  readonly onWidth: (width: number) => void;
}): ReactNode {
  return (
    <View className="flex-row rounded-t-lg border border-outline-variant bg-surface-1">
      <View className={geometry.compact ? NAME_WIDTH.compact : NAME_WIDTH.wide}>
        {geometry.compact ? null : (
          <Text variant="caption" tone="variant" className="px-3 py-2">
            Task
          </Text>
        )}
      </View>
      <View
        className="flex-1 flex-row"
        onLayout={(event: LayoutChangeEvent) => {
          onWidth(event.nativeEvent.layout.width);
        }}
      >
        {timelineDaysOf(geometry.window, today).map((day) => (
          <View
            key={day.day}
            className="flex-1 items-center border-l border-outline-variant py-1.5"
          >
            <Text
              variant="caption"
              tone={day.today ? 'primary' : 'variant'}
              numberOfLines={1}
              {...(day.today ? { className: 'font-medium' } : {})}
            >
              {day.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TimelineFoot(): ReactNode {
  return (
    <View className="px-gutter pb-section-gap">
      <View className="h-2 rounded-b-lg border-x border-b border-outline-variant bg-surface-1" />
      <Legend />
    </View>
  );
}

const LEGEND = [
  { key: 'overdue', swatch: 'border-critical/60 bg-critical/20', label: 'Overdue' },
  { key: 'undated', swatch: 'border-dashed border-outline', label: 'No due date' },
] as const;

function Legend(): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 pt-3">
      {LEGEND.map((entry) => (
        <View key={entry.key} className="flex-row items-center gap-1.5">
          <View className={cn('h-2.5 w-3.5 rounded-xs border', entry.swatch)} />
          <Text variant="caption" tone="variant">
            {entry.label}
          </Text>
        </View>
      ))}
      <Text variant="caption" tone="variant">
        Drag a bar end to change the due date
      </Text>
    </View>
  );
}

export interface TaskTimelineProps {
  readonly entries: readonly TaskEntry[];
  readonly today: string;
  readonly filter: TaskFilter;
  readonly header: ReactElement;
}

const DAYS = { compact: 7, wide: 14 } as const;

function keyOf(row: TimelineRow): string {
  return row.key;
}

export function TaskTimeline({ entries, today, filter, header }: TaskTimelineProps): ReactNode {
  const { person } = usePlannerFrame();
  const collections = usePlannerCollections(person);
  const now = useMinute();
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const [width, setWidth] = useState(0);
  const window = { from: today, days: compact ? DAYS.compact : DAYS.wide };
  const geometry: Geometry = { compact, width, window };
  const rows = timelineRowsOf({ entries, filter, collections, today, now, window });
  const renderItem = (row: TimelineRow): ReactElement => (
    <RowView row={row} geometry={geometry} now={now} />
  );
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      <VirtualList
        sections={rows.length === 0 ? [] : [{ key: 'timeline', title: null, data: rows }]}
        keyOf={keyOf}
        renderItem={renderItem}
        sameItem={sameTimelineRow}
        header={
          <View className="gap-3 px-gutter">
            {header}
            {rows.length === 0 ? null : (
              <DayAxis geometry={geometry} today={today} onWidth={setWidth} />
            )}
          </View>
        }
        {...(rows.length === 0 ? {} : { footer: <TimelineFoot /> })}
        empty={
          <EmptyState
            icon="calendar"
            title="Nothing on the timeline"
            body="Open tasks show up here as bars that end on their due date."
          />
        }
        probe="planner-task-timeline"
      />
    </View>
  );
}
