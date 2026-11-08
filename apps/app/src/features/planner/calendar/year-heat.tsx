import type { PlannerRange } from '@smarteverything/domain';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { CalendarHeatmap } from '../../../components/charts';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { decimal } from '../../../format/number';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { usePlannerRange } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { QueryBody } from '../frame/query-body';
import { frameLayoutOf } from '../frame/sections';
import { yearHeatOf, yearWindowOf, type HeatMonth } from './month-model';

interface MonthProps {
  readonly month: HeatMonth;
  readonly today: string;
  readonly wide: boolean;
  readonly onOpenMonth: (day: string) => void;
}

function Month({ month, today, wide, onOpenMonth }: MonthProps): ReactNode {
  return (
    <View className={cn('p-1.5', wide ? 'w-1/4' : 'w-1/3')}>
      <Interactive
        label={`Open ${month.name}`}
        onPress={() => {
          onOpenMonth(`${month.month}-01`);
        }}
        className="rounded-sm p-1"
        layerClassName="rounded-sm"
        focusInset
      >
        <CalendarHeatmap
          days={month.days}
          today={today}
          label={`Booked hours in ${month.name}`}
          unit="hours"
        />
      </Interactive>
    </View>
  );
}

const HeatMonthView = memo(Month);

interface YearBodyProps {
  readonly range: PlannerRange;
  readonly year: string;
  readonly onOpenMonth: (day: string) => void;
}

function YearBody({ range, year, onOpenMonth }: YearBodyProps): ReactNode {
  const timeZone = useSettings().time_zone;
  const today = useMinuteOf(dayKeyOf);
  const wide = frameLayoutOf(useAreaWidth()) !== 'compact';
  const verb = useIdiom() === 'pointer' ? 'Click' : 'Tap';
  const heat = yearHeatOf(year, range.occurrences, timeZone);
  return (
    <View className="gap-2">
      <View className="-mx-1.5 flex-row flex-wrap">
        {heat.months.map((month) => (
          <HeatMonthView
            key={month.month}
            month={month}
            today={today}
            wide={wide}
            onOpenMonth={onOpenMonth}
          />
        ))}
      </View>
      <Text variant="caption" tone="variant">
        {`Booked hours per day, ${decimal(heat.bookedMinutes / 60)} h in ${year}. ${verb} a month to open it.`}
      </Text>
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
