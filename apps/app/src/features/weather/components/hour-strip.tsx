import type { WeatherForecast } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { upcomingHours } from '../model/present';
import { HourCell } from './forecast-parts';

const CELL_MIN_WIDTH = 64;

export function HourStrip({
  forecast,
  now,
  most,
}: {
  readonly forecast: WeatherForecast;
  readonly now: number;
  readonly most: number;
}): ReactNode {
  const [count, setCount] = useState(0);
  const measure = (event: LayoutChangeEvent): void => {
    setCount(Math.min(most, Math.floor(event.nativeEvent.layout.width / CELL_MIN_WIDTH)));
  };
  return (
    <View className="flex-row" onLayout={measure}>
      {upcomingHours(forecast, now, count).map((hour, index) => (
        <HourCell
          key={hour.at}
          hour={hour}
          index={index}
          timeZone={forecast.timeZone}
          fixed={false}
        />
      ))}
    </View>
  );
}
