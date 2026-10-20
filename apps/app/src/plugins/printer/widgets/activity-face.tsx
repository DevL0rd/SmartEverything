import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { cn } from '../../../design/cn';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { CalendarHeatmap, HourHeatmap } from '../../../components/charts';
import type { HeatDay } from '../../../components/charts/heatmap-model';
import { Icon } from '../../../components/icon';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { rounded } from '../../../features/device-visuals';
import { useDayKey } from '../../../store/clock';
import type { Device } from '../../../store/state';
import type { ViewOf } from '../data/printer-api';
import { usePrinterView } from '../data/use-printer-view';
import { streakLine } from '../model/stats-view';

const STRIP_DAYS = 28;
const STRIP_HEIGHT = 28;
const STRIP_STEP = 10;

function Strip({ days }: { readonly days: readonly HeatDay[] }): ReactNode {
  const recent = days.slice(-STRIP_DAYS);
  const top = Math.max(1, ...recent.map((day) => day.pages));
  const primary = useColour('primary');
  const quiet = useColour('surface-3');
  return (
    <Svg
      accessible
      accessibilityRole="image"
      accessibilityLabel="Pages printed on each of the last 28 days"
      width="100%"
      height={STRIP_HEIGHT}
      viewBox={`0 0 ${String(recent.length * STRIP_STEP)} ${String(STRIP_HEIGHT)}`}
      preserveAspectRatio="none"
    >
      {recent.map((day, index) => {
        const height = Math.max(3, (day.pages / top) * STRIP_HEIGHT);
        return (
          <Path
            key={day.day}
            d={rounded({
              x: index * STRIP_STEP,
              y: STRIP_HEIGHT - height,
              w: STRIP_STEP - 2,
              h: height,
              r: 2,
            })}
            fill={day.covered ? primary : quiet}
          />
        );
      })}
    </Svg>
  );
}

function Maps({
  view,
  today,
  calendar,
}: {
  readonly view: ViewOf<'stats'>;
  readonly today: string;
  readonly calendar: boolean;
}): ReactNode {
  const wide = atLeast(useSizeClass().width, 'medium');
  return (
    <View className={cn('min-h-0 gap-3', wide && 'flex-row gap-6')}>
      <View className={cn('min-w-0', wide && 'flex-1')}>
        {calendar ? (
          <CalendarHeatmap
            days={view.stats.heatmap}
            today={today}
            label="Pages printed on each day"
          />
        ) : (
          <Strip days={view.stats.heatmap} />
        )}
      </View>
      <View className={cn('min-w-0', wide && 'flex-1')}>
        <HourHeatmap matrix={view.stats.weekdayHour} label="Pages printed by weekday and hour" />
      </View>
    </View>
  );
}

export function ActivityFace({ device }: { readonly device: Device }): ReactNode {
  const { cls } = useWidgetFace();
  const today = useDayKey();
  const stats = usePrinterView(device, 'stats', { period: 'month', anchor: today });
  return (
    <LoadedQuery query={stats}>
      {(view) => (
        <View className="flex-1 justify-between gap-3">
          {cls === 'xl' || cls === 'l' ? (
            <Maps view={view} today={today} calendar={cls === 'xl'} />
          ) : (
            <Strip days={view.stats.heatmap} />
          )}
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <View className="flex-row items-center gap-1.5">
              <Icon
                name="flame"
                size={16}
                tone={view.stats.printing.current > 0 ? 'warning' : 'faint'}
              />
              <Text variant="caption" numberOfLines={1}>
                {streakLine(view.stats.printing.current, view.stats.printing.longest, 'printing')}
              </Text>
            </View>
            <Text variant="caption" tone="variant" className="tabular">
              This month: {String(Math.round(view.stats.totals.pages))} pages,{' '}
              {String(view.stats.totals.jobs)} jobs
            </Text>
          </View>
        </View>
      )}
    </LoadedQuery>
  );
}
