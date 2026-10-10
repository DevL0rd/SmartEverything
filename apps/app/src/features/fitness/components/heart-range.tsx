import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useColour } from '../../../design/colour';

const FLOOR = 40;
const CEILING = 190;

function share(value: number): number {
  return Math.min(1, Math.max(0, (value - FLOOR) / (CEILING - FLOOR)));
}

export function HeartRange({
  low,
  high,
  resting,
}: {
  readonly low: number;
  readonly high: number;
  readonly resting: number | null;
}): ReactNode {
  const heart = useColour('heart');
  const start = share(low);
  const end = Math.max(share(high), start + 0.02);
  const track = { backgroundColor: heart, opacity: 0.16 };
  const before = { flex: start };
  const segment = { flex: end - start, backgroundColor: heart };
  const after = { flex: 1 - end };
  const mark = resting === null ? null : share(resting);
  const lead = { flex: mark ?? 0 };
  const tail = { flex: 1 - (mark ?? 0) };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Heart rate from ${String(Math.round(low))} to ${String(Math.round(high))} bpm`}
      className="h-3 w-full justify-center"
    >
      <View style={track} className="absolute inset-x-0 h-1.5 rounded-full" />
      <View className="h-1.5 w-full flex-row">
        <View style={before} />
        <View style={segment} className="h-full rounded-full" />
        <View style={after} />
      </View>
      {mark === null ? null : (
        <View className="absolute inset-x-0 flex-row items-center">
          <View style={lead} />
          <View className="w-0 items-center">
            <View className="size-3 rounded-full border-2 border-surface-1 bg-on-surface" />
          </View>
          <View style={tail} />
        </View>
      )}
    </View>
  );
}
