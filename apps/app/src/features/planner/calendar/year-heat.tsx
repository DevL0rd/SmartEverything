import type { PlannerRange } from '@smarteverything/domain';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { WEEKDAY_ROWS, heatSummary, type HeatDay } from '../../../components/charts/heatmap-model';
import { Interactive } from '../../../components/interactive';
import { useFrameBodyWidth } from '../../../components/page-shell/body-width';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { decimal } from '../../../format/number';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { usePlannerRange } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { QueryBody } from '../frame/query-body';
import { monthDaysOf, yearHeatOf, yearWindowOf, type HeatMonth } from './month-model';
import { useCalendarWide } from './pane-width';

const LEVEL_FILL: readonly string[] = [
  'bg-outline-variant',
  'bg-primary/30',
  'bg-primary/50',
  'bg-primary/75',
  'bg-primary',
];

function fillOf(level: number): string {
  const fill = LEVEL_FILL[level];
  if (fill === undefined) throw new Error(`There is no fill for heat level ${String(level)}`);
  return fill;
}

function HeatCell({
  heat,
  today,
}: {
  readonly heat: HeatDay | undefined;
  readonly today: boolean;
}): ReactNode {
  return (
    <View className="aspect-square min-w-0 flex-1">
      {heat === undefined ? null : (
        <View
          className={cn(
            'flex-1 rounded-xs',
            fillOf(heat.level),
            today && 'border border-on-surface',
          )}
        />
      )}
    </View>
  );
}

function WeekdayCue(): ReactNode {
  return (
    <View aria-hidden className="flex-row gap-0.5">
      {WEEKDAY_ROWS.map((row) => (
        <Text
          key={row.name}
          variant="caption"
          tone="faint"
          align="center"
          className="min-w-0 flex-1"
        >
          {row.short}
        </Text>
      ))}
    </View>
  );
}

const SIX_ACROSS_FROM = 800;

type Spread = 'narrow' | 'wide' | 'full';

const MONTH_WIDTH: Readonly<Record<Spread, string>> = {
  narrow: 'w-1/3 p-1',
  wide: 'w-1/4 p-2',
  full: 'w-1/6 p-2',
};

function spreadOf(wide: boolean, bodyWidth: number): Spread {
  if (!wide) return 'narrow';
  return bodyWidth >= SIX_ACROSS_FROM ? 'full' : 'wide';
}

interface MonthProps {
  readonly month: HeatMonth;
  readonly today: string;
  readonly spread: Spread;
  readonly onOpenMonth: (day: string) => void;
}

function Month({ month, today, spread, onOpenMonth }: MonthProps): ReactNode {
  const heat = new Map(month.days.map((day) => [day.day, day] as const));
  const wide = spread !== 'narrow';
  return (
    <View className={MONTH_WIDTH[spread]}>
      <Interactive
        label={`Open ${month.name}. Booked hours: ${heatSummary(month.days, 'hours')}`}
        onPress={() => {
          onOpenMonth(`${month.month}-01`);
        }}
        className={cn('gap-1 rounded-sm', wide ? 'p-2' : 'p-1')}
        layerClassName="rounded-sm"
        focusInset
      >
        <Text variant="label" numberOfLines={1}>
          {month.name}
        </Text>
        <WeekdayCue />
        {monthDaysOf(month.month).map((week) => (
          <View key={week[0]} className="flex-row gap-0.5">
            {week.map((day) => (
              <HeatCell key={day} heat={heat.get(day)} today={day === today} />
            ))}
          </View>
        ))}
      </Interactive>
    </View>
  );
}

const HeatMonthView = memo(Month);

function Legend(): ReactNode {
  return (
    <View aria-hidden className="flex-row items-center gap-1.5">
      <Text variant="caption" tone="variant">
        Less
      </Text>
      {LEVEL_FILL.map((fill) => (
        <View key={fill} className={cn('size-3 rounded-xs', fill)} />
      ))}
      <Text variant="caption" tone="variant">
        More
      </Text>
    </View>
  );
}

interface YearBodyProps {
  readonly range: PlannerRange;
  readonly year: string;
  readonly onOpenMonth: (day: string) => void;
}

function YearBody({ range, year, onOpenMonth }: YearBodyProps): ReactNode {
  const timeZone = useSettings().time_zone;
  const today = useMinuteOf(dayKeyOf);
  const wide = useCalendarWide();
  const spread = spreadOf(wide, useFrameBodyWidth());
  const verb = useIdiom() === 'pointer' ? 'Click' : 'Tap';
  const heat = yearHeatOf(year, range.occurrences, timeZone);
  return (
    <View className="gap-3">
      <View className={cn('flex-row flex-wrap', wide ? '-mx-2' : '-mx-1')}>
        {heat.months.map((month) => (
          <HeatMonthView
            key={month.month}
            month={month}
            today={today}
            spread={spread}
            onOpenMonth={onOpenMonth}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Text variant="caption" tone="variant" className="min-w-0 shrink">
          {`Booked hours per day, ${decimal(heat.bookedMinutes / 60)} h in ${year}. ${verb} a month to open it.`}
        </Text>
        <Legend />
      </View>
    </View>
  );
}

export interface YearHeatProps {
  readonly day: string;
  readonly calendars: readonly string[] | null;
  readonly onOpenMonth: (day: string) => void;
}

export function YearHeat({ day, calendars, onOpenMonth }: YearHeatProps): ReactNode {
  const { person } = usePlannerFrame();
  const year = day.slice(0, 4);
  const { from, to } = yearWindowOf(year, useSettings().time_zone);
  return (
    <QueryBody query={usePlannerRange(person, from, to, calendars)}>
      {(range) => <YearBody range={range} year={year} onOpenMonth={onOpenMonth} />}
    </QueryBody>
  );
}
