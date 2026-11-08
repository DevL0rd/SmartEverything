import type { WeatherForecast } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { WidgetStats } from '../../../components/widget-board';
import { useIdiom } from '../../../design/platform';
import { DayList } from '../components/forecast-parts';
import type { WeatherStat } from '../model/stats';
import { dayCapacity, statCapacity, statColumns, type Box } from './fit-math';

const EMPTY: Box = { width: 0, height: 0 };

function useBox(): { readonly box: Box; readonly onLayout: (event: LayoutChangeEvent) => void } {
  const [box, setBox] = useState(EMPTY);
  return {
    box,
    onLayout: (event): void => {
      const { width, height } = event.nativeEvent.layout;
      setBox({ width, height });
    },
  };
}

export function FittedStats({ stats }: { readonly stats: readonly WeatherStat[] }): ReactNode {
  const { box, onLayout } = useBox();
  const idiom = useIdiom();
  const captioned = stats.some((stat) => stat.caption !== undefined);
  const shown = stats.slice(0, statCapacity(box, idiom, captioned));
  return (
    <View className="min-w-0 flex-1" onLayout={onLayout}>
      {shown.length === 0 ? null : <WidgetStats stats={shown} columns={statColumns(box.width)} />}
    </View>
  );
}

export function FittedDays({
  forecast,
  now,
}: {
  readonly forecast: WeatherForecast;
  readonly now: number;
}): ReactNode {
  const { box, onLayout } = useBox();
  const count = dayCapacity(box.height);
  return (
    <View className="flex-1" onLayout={onLayout}>
      {count === 0 ? null : <DayList forecast={forecast} now={now} count={count} />}
    </View>
  );
}
