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
import { useIdiom } from '../../../design/platform';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useInstantClock } from '../../clock/format/clock-format';
import { usePlannerRange } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { QueryBody } from '../frame/query-body';
import { useFrameBodyWidth } from '../../../components/page-shell/body-width';
import { LIST_DOT } from '../item/composer-tokens';
import { useCalendarLooks } from './calendar-looks';
import type { EventLook } from './calendars-model';
import { AgendaDayHead, AgendaItem } from './agenda-list';
import { agendaRowsOf } from './agenda-model';
import {
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

const WIDE_CELL_FROM = 88;

const WEEK_DAYS = 7;

export function cellSizeOf(bodyWidth: number): CellSize {
  return bodyWidth / WEEK_DAYS >= WIDE_CELL_FROM ? 'wide' : 'compact';
}

type CellSize = keyof typeof BARS_THAT_FIT;

type ColourOf = (view: PlannerOccurrenceView) => string;

export function paintOf(colour: PlannerColourKey | null, look: EventLook): string {
  const fill = colour === null ? 'bg-on-surface-variant' : LIST_DOT[colour];
  if (look !== 'invited' && look !== 'maybe') return fill;
  return cn('border border-on-surface-variant', look === 'invited' ? 'bg-transparent' : fill);
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
      className={cn('mt-0.5 h-1 rounded-xs', colours(view))}
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
      <View className={cn('size-1.5 rounded-full', colours(view))} />
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
  const pointer = useIdiom() === 'pointer';
  if (cell.more === 0) return null;
  return (
    <View className="absolute right-0.5 top-0">
      <Interactive
        label={`Open ${dayLabelOf(cell.day, true)}, ${String(cell.more)} more`}
        onPress={() => {
          onOpenDay(cell.day);
        }}
        className={cn(
          'justify-center rounded-sm px-1.5',
          pointer ? 'h-8 min-w-8' : 'h-11 min-w-11',
        )}
        layerClassName="rounded-sm"
      >
        <Text variant="caption" tone="variant" className="tabular">
          {`+${String(cell.more)} more`}
        </Text>
      </Interactive>
    </View>
  );
}

function CompactMore({ cell }: { readonly cell: MonthCell }): ReactNode {
  if (cell.more === 0) return null;
  return (
    <Text variant="caption" tone="variant" align="center" className="tabular">
      {`+${String(cell.more)}`}
    </Text>
  );
}

interface CellProps {
  readonly cell: MonthCell;
  readonly size: CellSize;
  readonly colours: ColourOf;
  readonly onPress: (day: string) => void;
  readonly onOpenDay: (day: string) => void;
}

function cellClassOf(cell: MonthCell, compact: boolean, pointer: boolean): string {
  if (compact)
    return cn(
      'h-15 min-w-0 flex-1 overflow-hidden rounded-md',
      cell.selected && 'bg-primary-container',
    );
  return cn(
    'min-w-0 flex-1 overflow-hidden rounded-md border-hairline border-outline-variant',
    pointer ? 'h-30' : 'h-33',
    cell.selected ? 'bg-primary-container' : 'bg-surface-1',
  );
}

function dateRowOf(compact: boolean, pointer: boolean): string {
  if (compact) return 'items-center';
  return cn('justify-center', pointer ? 'h-8' : 'h-11');
}

function Cell({ cell, size, colours, onPress, onOpenDay }: CellProps): ReactNode {
  const compact = size === 'compact';
  const pointer = useIdiom() === 'pointer';
  return (
    <View className={cellClassOf(cell, compact, pointer)}>
      <Interactive
        label={cell.spoken}
        selected={cell.selected}
        onPress={() => {
          onPress(cell.day);
        }}
        className={cn('flex-1 px-1 pt-1', !compact && 'gap-0.5 px-2')}
        layerClassName="rounded-md"
        focusInset
      >
        <View className={dateRowOf(compact, pointer)}>
          <DateMark cell={cell} />
        </View>
        <View className={cn(!compact && 'gap-0.5', !cell.inMonth && 'opacity-60')}>
          {compact ? (
            <Bars cell={cell} colours={colours} />
          ) : (
            <Chips cell={cell} colours={colours} />
          )}
        </View>
        {compact ? <CompactMore cell={cell} /> : null}
      </Interactive>
      {compact ? null : <More cell={cell} onOpenDay={onOpenDay} />}
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
          align={size === 'compact' ? 'center' : 'start'}
          className={cn('min-w-0 flex-1 py-1', size === 'wide' && 'px-2')}
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
  const looks = useCalendarLooks(person);
  return (view) =>
    paintOf(
      looks.collections.find((row) => row.id === view.collection_id)?.colour ?? null,
      looks.lookOf(view),
    );
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
  const looks = useCalendarLooks(person);
  const instant = useInstantClock();
  const rows = agendaRowsOf({
    days,
    window: [day, day],
    today,
    collections: looks.collections,
    timeZone,
    query: '',
    lookOf: looks.lookOf,
    instant,
  });
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
  const size = cellSizeOf(useFrameBodyWidth());
  const month = monthOf(day);
  const [picked, pick] = useState(day);
  const selected = monthOf(picked) === month ? picked : day;
  const looks = useCalendarLooks(usePlannerFrame().person);
  const days = dayMapOf(looks.shown(range.occurrences), timeZone, monthBoundsOf(month));
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
