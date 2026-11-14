import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { cn } from '../../../design/cn';
import { CalendarHeatmap, HourHeatmap, WEEKDAY_ROWS } from '../../../components/charts';
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
const STRIP_STEP = 10;
const SHORTEST_BAR = 3;

export function FitPlot({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: (plot: number) => ReactNode;
}): ReactNode {
  const [room, setRoom] = useState(0);
  const [chrome, setChrome] = useState(0);
  const plot = Math.max(0, Math.floor(room - chrome));
  const onRoom = (event: LayoutChangeEvent): void => {
    setRoom(event.nativeEvent.layout.height);
  };
  const onContent = (event: LayoutChangeEvent): void => {
    setChrome(Math.max(0, Math.ceil(event.nativeEvent.layout.height - plot)));
  };
  return (
    <View className={cn('min-h-0 min-w-0 flex-1', className)} onLayout={onRoom}>
      <View onLayout={onContent}>{children(plot)}</View>
    </View>
  );
}

function Strip({
  days,
  height,
}: {
  readonly days: readonly HeatDay[];
  readonly height: number;
}): ReactNode {
  const recent = days.slice(-STRIP_DAYS);
  const top = Math.max(1, ...recent.map((day) => day.pages));
  const primary = useColour('primary');
  const quiet = useColour('surface-3');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Pages printed on each of the last 28 days"
    >
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${String(recent.length * STRIP_STEP)} ${String(height)}`}
        preserveAspectRatio="none"
      >
        {recent.map((day, index) => {
          const bar = Math.min(height, Math.max(SHORTEST_BAR, (day.pages / top) * height));
          return (
            <Path
              key={day.day}
              d={rounded({
                x: index * STRIP_STEP,
                y: height - bar,
                w: STRIP_STEP - 2,
                h: bar,
                r: 2,
              })}
              fill={day.covered ? primary : quiet}
            />
          );
        })}
      </Svg>
    </View>
  );
}

function FitStrip({ days }: { readonly days: readonly HeatDay[] }): ReactNode {
  return <FitPlot>{(plot) => (plot > 0 ? <Strip days={days} height={plot} /> : null)}</FitPlot>;
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
  const hours = (
    <HourHeatmap
      matrix={view.stats.weekdayHour}
      rows={WEEKDAY_ROWS}
      unit="pages printed"
      label="Pages printed by weekday and hour"
    />
  );
  return (
    <View className="min-h-0 flex-1 gap-3">
      <FitStrip days={view.stats.heatmap} />
      {calendar ? (
        <View className="flex-row items-start gap-6">
          <View className="w-1/5 min-w-0">
            <CalendarHeatmap
              days={view.stats.heatmap}
              today={today}
              unit="pages printed"
              label="Pages printed on each day"
            />
          </View>
          <View className="min-w-0 flex-1">{hours}</View>
        </View>
      ) : (
        hours
      )}
    </View>
  );
}

function Footer({ view }: { readonly view: ViewOf<'stats'> }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      <View className="flex-row items-center gap-1.5">
        <Icon name="flame" size={16} tone={view.stats.printing.current > 0 ? 'warning' : 'faint'} />
        <Text variant="caption" numberOfLines={1}>
          {streakLine(view.stats.printing.current, view.stats.printing.longest, 'printing')}
        </Text>
      </View>
      <Text variant="caption" tone="variant" className="tabular">
        This month: {String(Math.round(view.stats.totals.pages))} pages,{' '}
        {String(view.stats.totals.jobs)} jobs
      </Text>
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
        <View className="flex-1 gap-3">
          {cls === 'xl' || cls === 'l' ? (
            <Maps view={view} today={today} calendar={cls === 'xl'} />
          ) : (
            <FitStrip days={view.stats.heatmap} />
          )}
          <Footer view={view} />
        </View>
      )}
    </LoadedQuery>
  );
}
