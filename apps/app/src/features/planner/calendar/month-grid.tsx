import type {
  PlannerColourKey,
  PlannerOccurrenceView,
  PlannerRange,
} from '@smarteverything/domain';
import { memo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { WEEKDAY_ROWS } from '../../../components/charts/heatmap-model';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useAreaWidth } from '../../../design/size-class';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { usePlannerCollections, usePlannerRange } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { QueryBody } from '../frame/query-body';
import { frameLayoutOf } from '../frame/sections';
import { LIST_DOT } from '../item/composer-tokens';
import { AgendaDayHead, AgendaItem } from './agenda-list';
import {
  agendaRowsOf,
  countsOf,
  dayLabelOf,
  dayMapOf,
  monthBoundsOf,
  monthOf,
  monthWeeksOf,
  monthWindowOf,
  type DayMap,
  type MonthCell,
} from './month-model';

const BARS_THAT_FIT = { compact: 3, wide: 4 } as const;

type CellSize = keyof typeof BARS_THAT_FIT;

type ColourOf = (collectionId: string) => PlannerColourKey | null;

function dotOf(view: PlannerOccurrenceView, colours: ColourOf): string {
  const colour = colours(view.collection_id);
  return colour === null ? 'bg-on-surface-variant' : LIST_DOT[colour];
}

function Bars({
  cell,
  colours,
}: {
  readonly cell: MonthCell;
  readonly colours: ColourOf;
}): ReactNode {
  return cell.shown.map((view) => (
    <View
      key={`${view.item_id}:${view.occurrence_key}`}
      className={cn('mt-0.5 h-1 rounded-xs', dotOf(view, colours))}
    />
  ));
}

function Chips({
  cell,
  colours,
}: {
  readonly cell: MonthCell;
  readonly colours: ColourOf;
}): ReactNode {
  return cell.shown.map((view) => (
    <View
      key={`${view.item_id}:${view.occurrence_key}`}
      className="h-4 flex-row items-center gap-1"
    >
      <View className={cn('size-1.5 rounded-full', dotOf(view, colours))} />
      <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
        {view.title}
      </Text>
    </View>
  ));
}

function DateMark({ cell }: { readonly cell: MonthCell }): ReactNode {
  return (
    <Text
      variant="caption"
      tone={cell.today ? 'primary' : cell.inMonth ? 'default' : 'variant'}
      className={cn('tabular', cell.today ? 'font-sans-semibold' : 'font-sans')}
    >
      {String(cell.date)}
    </Text>
  );
}

function More({
  cell,
  onOpenDay,
}: {
  readonly cell: MonthCell;
  readonly onOpenDay: (day: string) => void;
}): ReactNode {
  if (cell.more === 0) return null;
  return (
    <Interactive
      label={`Open ${dayLabelOf(cell.day, true)}, ${String(cell.more)} more`}
      onPress={() => {
        onOpenDay(cell.day);
      }}
      hitSlop={6}
      className="self-start rounded-xs px-0.5"
      layerClassName="rounded-xs"
    >
      <Text variant="caption" tone="variant" className="tabular">
        {`+${String(cell.more)}`}
      </Text>
    </Interactive>
  );
}

interface CellProps {
  readonly cell: MonthCell;
  readonly size: CellSize;
  readonly colours: ColourOf;
  readonly onPress: (day: string) => void;
  readonly onOpenDay: (day: string) => void;
}

function Cell({ cell, size, colours, onPress, onOpenDay }: CellProps): ReactNode {
  const compact = size === 'compact';
  return (
    <View
      className={cn(
        'min-w-0 flex-1 overflow-hidden rounded-md',
        compact ? 'h-15' : 'min-h-24 border-hairline border-outline-variant',
        cell.selected ? 'bg-primary-container' : compact ? '' : 'bg-surface-1',
      )}
    >
      <Interactive
        label={cell.spoken}
        selected={cell.selected}
        onPress={() => {
          onPress(cell.day);
        }}
        className={cn('flex-1 px-1 pt-1', !compact && 'gap-0.5 px-2 pt-1.5')}
        layerClassName="rounded-md"
        focusInset
      >
        <DateMark cell={cell} />
        <View className={cn(!compact && 'gap-0.5', !cell.inMonth && 'opacity-60')}>
          {compact ? (
            <Bars cell={cell} colours={colours} />
          ) : (
            <Chips cell={cell} colours={colours} />
          )}
        </View>
      </Interactive>
      <View className={compact ? 'px-1' : 'px-2 pb-1'}>
        <More cell={cell} onOpenDay={onOpenDay} />
      </View>
    </View>
  );
}

const MonthCellView = memo(Cell);

function WeekdayRow({ size }: { readonly size: CellSize }): ReactNode {
  return (
    <View aria-hidden className="flex-row gap-0.5">
      {WEEKDAY_ROWS.map((row) => (
        <Text
          key={row.name}
          variant="caption"
          tone="variant"
          align="center"
          className="flex-1 py-1"
        >
          {size === 'compact' ? row.short : row.name.slice(0, 3)}
        </Text>
      ))}
    </View>
  );
}

interface GridProps {
  readonly month: string;
  readonly days: DayMap;
  readonly selected: string | null;
  readonly size: CellSize;
  readonly onPress: (day: string) => void;
  readonly onOpenDay: (day: string) => void;
}

function useColours(): ColourOf {
  const { person } = usePlannerFrame();
  const collections = usePlannerCollections(person);
  return (collectionId) => collections.find((row) => row.id === collectionId)?.colour ?? null;
}

function Grid({ month, days, selected, size, onPress, onOpenDay }: GridProps): ReactNode {
  const today = useMinuteOf(dayKeyOf);
  const colours = useColours();
  const weeks = monthWeeksOf({ month, today, selected, days, fits: BARS_THAT_FIT[size] });
  return (
    <View role="grid" className="gap-0.5">
      <WeekdayRow size={size} />
      {weeks.map((week) => (
        <View key={week.key} className="flex-row gap-0.5">
          {week.cells.map((cell) => (
            <MonthCellView
              key={cell.day}
              cell={cell}
              size={size}
              colours={colours}
              onPress={onPress}
              onOpenDay={onOpenDay}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function SelectedDay({ days, day }: { readonly days: DayMap; readonly day: string }): ReactNode {
  const { person } = usePlannerFrame();
  const timeZone = useSettings().time_zone;
  const today = useMinuteOf(dayKeyOf);
  const collections = usePlannerCollections(person);
  const rows = agendaRowsOf({ days, window: [day, day], today, collections, timeZone, query: '' });
  if (rows.length === 0) {
    return (
      <AgendaDayHead
        head={{ label: dayLabelOf(day, false), counts: countsOf([]), today: day === today }}
      />
    );
  }
  return (
    <View>
      {rows.map((row) =>
        row.kind === 'head' ? (
          <AgendaDayHead key={row.key} head={row.head} />
        ) : (
          <AgendaItem key={row.key} entry={row.entry} edge={row.edge} wide={false} />
        ),
      )}
    </View>
  );
}

interface MonthBodyProps {
  readonly range: PlannerRange;
  readonly day: string;
  readonly onOpenDay: (day: string) => void;
}

function MonthBody({ range, day, onOpenDay }: MonthBodyProps): ReactNode {
  const timeZone = useSettings().time_zone;
  const size: CellSize = frameLayoutOf(useAreaWidth()) === 'compact' ? 'compact' : 'wide';
  const month = monthOf(day);
  const [picked, pick] = useState(day);
  const selected = monthOf(picked) === month ? picked : day;
  const days = dayMapOf(range.occurrences, timeZone, monthBoundsOf(month));
  if (size === 'wide') {
    return (
      <Grid
        month={month}
        days={days}
        selected={null}
        size={size}
        onPress={onOpenDay}
        onOpenDay={onOpenDay}
      />
    );
  }
  return (
    <View className="gap-2">
      <Grid
        month={month}
        days={days}
        selected={selected}
        size={size}
        onPress={pick}
        onOpenDay={onOpenDay}
      />
      <SelectedDay days={days} day={selected} />
    </View>
  );
}

export interface MonthGridProps {
  readonly day: string;
  readonly calendars: readonly string[] | null;
  readonly onOpenDay: (day: string) => void;
}

export function MonthGrid({ day, calendars, onOpenDay }: MonthGridProps): ReactNode {
  const { person } = usePlannerFrame();
  const { from, to } = monthWindowOf(monthOf(day), useSettings().time_zone);
  return (
    <QueryBody query={usePlannerRange(person, from, to, calendars)}>
      {(range) => <MonthBody range={range} day={day} onOpenDay={onOpenDay} />}
    </QueryBody>
  );
}
