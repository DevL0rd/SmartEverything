import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc, type ArcTick } from '../../../components/charts';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { LiveSpark } from '../card/live-spark';
import type { WideClass } from '../card/wide-card';
import { humidityShare, targetTick } from './humidity-model';
import {
  RING_MIN_PX,
  RING_PX,
  RING_STROKE_PX,
  SPARK_MIN_PX,
  SPARK_PX,
  shownPx,
  useGraphRoom,
} from './layout';

const TICK_THICKNESS = 10;

function ticksOf(target: number | null): readonly ArcTick[] {
  return target === null
    ? []
    : [{ ...targetTick(target), colour: 'on-surface', thickness: TICK_THICKNESS }];
}

function HumidityRing({
  humidity,
  target,
  size,
}: {
  readonly humidity: number | null;
  readonly target: number | null;
  readonly size: number;
}): ReactNode {
  const box = { width: size, height: size };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        humidity === null ? 'No humidity reading' : `Humidity ${String(Math.round(humidity))} %`
      }
      style={box}
      className="items-center justify-center"
    >
      <Arc
        value={humidity === null ? 0 : humidityShare(humidity)}
        size={size}
        thickness={RING_STROKE_PX}
        colour="humidity"
        ticks={ticksOf(target)}
        overlay
      />
      <Text variant={size <= RING_PX.m ? 'label' : 'body-strong'}>
        {humidity === null ? '–' : `${String(Math.round(humidity))} %`}
      </Text>
    </View>
  );
}

export function HumidifierGraph({
  device,
  capability,
  humidity,
  target,
  cls,
  live,
}: {
  readonly device: Device;
  readonly capability: string;
  readonly humidity: number | null;
  readonly target: number | null;
  readonly cls: WideClass;
  readonly live: boolean;
}): ReactNode {
  const { room, onLayout } = useGraphRoom(RING_PX[cls]);
  const ring = shownPx(RING_PX[cls], room, RING_MIN_PX);
  const spark = shownPx(SPARK_PX[cls], room, SPARK_MIN_PX);
  return (
    <View
      onLayout={onLayout}
      className={cn('min-h-0 flex-1 justify-end', !device.online && 'opacity-60')}
    >
      <View className="flex-row items-center gap-3">
        {ring === null ? null : <HumidityRing humidity={humidity} target={target} size={ring} />}
        {spark === null ? null : (
          <View className="min-w-0 flex-1">
            <LiveSpark
              device={device}
              capability={capability}
              live={live}
              colour="humidity"
              height={spark}
            />
          </View>
        )}
      </View>
    </View>
  );
}
