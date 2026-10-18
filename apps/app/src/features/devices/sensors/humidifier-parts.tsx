import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc, type ArcTick } from '../../../components/charts';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { LiveSpark } from '../card/live-spark';
import type { WideClass } from '../card/wide-card';
import { humidityShare, targetTick } from './humidity-model';
import { RING_PX, SPARK_PX } from './layout';
import { levelPill } from './state-line';

const RING_THICKNESS = 6;
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
      <View className="absolute inset-0">
        <Arc
          value={humidity === null ? 0 : humidityShare(humidity)}
          size={size}
          thickness={RING_THICKNESS}
          colour="humidity"
          ticks={ticksOf(target)}
        />
      </View>
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
  water,
  cls,
}: {
  readonly device: Device;
  readonly capability: string;
  readonly humidity: number | null;
  readonly target: number | null;
  readonly water: number | null;
  readonly cls: WideClass;
}): ReactNode {
  return (
    <View className={cn('flex-row items-center gap-3', !device.online && 'opacity-60')}>
      <HumidityRing humidity={humidity} target={target} size={RING_PX[cls]} />
      <View className="min-w-0 flex-1 gap-1">
        <LiveSpark
          device={device}
          capability={capability}
          colour="humidity"
          height={SPARK_PX[cls]}
        />
        {cls === 'm' ? levelPill('Water', water) : null}
      </View>
    </View>
  );
}
