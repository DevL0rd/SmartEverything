import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useVisibleMinuteOf } from '../data';
import { nowPlaceOf, sameNow, yOf, type NowPlace } from './time-grid-layout';

interface NowStyle {
  readonly top: number;
  readonly left: `${number}%`;
  readonly width: `${number}%`;
}

export function nowStyleOf(place: NowPlace, columns: number, hourHeight: number): NowStyle {
  return {
    top: yOf(place.minute, hourHeight),
    left: `${(place.index / columns) * 100}%`,
    width: `${100 / columns}%`,
  };
}

export function NowLine({
  days,
  timeZone,
  hourHeight,
}: {
  readonly days: readonly string[];
  readonly timeZone: string;
  readonly hourHeight: number;
}): ReactNode {
  const ref = useRef<View>(null);
  const place = useVisibleMinuteOf(ref, (now) => nowPlaceOf(days, now, timeZone), sameNow);
  return (
    <View ref={ref} onLayout={place.onLayout} pointerEvents="none" className="absolute inset-0">
      {place.value === null ? null : (
        <View
          aria-hidden
          style={nowStyleOf(place.value, days.length, hourHeight)}
          className="absolute -mt-px h-0.5 bg-primary"
        >
          <View className="absolute -left-1 -top-1 size-2.5 rounded-full bg-primary" />
        </View>
      )}
    </View>
  );
}
