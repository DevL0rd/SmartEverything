import type { PlannerStopwatchRow } from '@smarteverything/domain';
import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../../components/text';
import { TONE_TEXT, type Tone } from '../../components/tone';
import { cn } from '../../design/cn';
import { useVisibleLive } from '../../design/use-visible-live';
import { readSecond, useSecondOf } from '../../store/clock';
import {
  bestLapOf,
  currentLapSourceOf,
  digitAt,
  facePlacesOf,
  hourDigitsOf,
  lapTime,
  stopwatchSourceOf,
  tickValueAt,
  type FacePlace,
  type TickSource,
} from './lap-model';

export type FaceSize = 'footnote' | 's' | 'm' | 'l' | 'xl';

const FACE_TEXT: Readonly<Record<FaceSize, string>> = {
  footnote: 'font-sans text-footnote',
  s: 'font-sans-medium text-figure-s',
  m: 'font-sans-medium text-figure-m tracking-tight',
  l: 'font-sans-medium text-figure-l tracking-tight',
  xl: 'font-sans-medium text-figure-xl tracking-tighter',
};

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function useTickingMs(source: TickSource, live: boolean): SharedValue<number> {
  const { base, since, rate, roundUp } = source;
  const ms = useSharedValue(tickValueAt(source, readSecond()));
  const held = useSharedValue<TickSource>(source);
  const frame = useFrameCallback(() => {
    'worklet';
    ms.set(tickValueAt(held.get(), Date.now()));
  }, false);
  useEffect(() => {
    const next: TickSource = { base, since, rate, roundUp };
    held.set(next);
    ms.set(tickValueAt(next, Date.now()));
    frame.setActive(live && since !== null);
    return (): void => {
      frame.setActive(false);
    };
  }, [base, since, rate, roundUp, live, frame, held, ms]);
  return ms;
}

interface ColumnProps {
  readonly ms: SharedValue<number>;
  readonly unit: number;
  readonly base: number;
  readonly className: string;
}

function DigitColumn({ ms, unit, base, className }: ColumnProps): ReactNode {
  const line = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -digitAt(ms.get(), unit, base) * line.get() }],
  }));
  return (
    <View className="overflow-hidden">
      <Text
        className={cn(className, 'opacity-0')}
        onLayout={(event) => {
          line.set(event.nativeEvent.layout.height);
        }}
      >
        0
      </Text>
      <Animated.View style={style} className="absolute inset-x-0 top-0 items-center">
        {DIGITS.map((digit) => (
          <Text key={digit} className={className}>
            {digit}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

function Place({
  place,
  ms,
  className,
}: {
  readonly place: FacePlace;
  readonly ms: SharedValue<number>;
  readonly className: string;
}): ReactNode {
  if (place.kind === 'mark') return <Text className={className}>{place.text}</Text>;
  return <DigitColumn ms={ms} unit={place.unit} base={place.base} className={className} />;
}

export interface TickingTimeProps {
  readonly source: TickSource;
  readonly live: boolean;
  readonly size: FaceSize;
  readonly tone?: Tone;
  readonly hundredths?: FaceSize | null;
  readonly ms?: SharedValue<number>;
}

function classOf(size: FaceSize, tone: Tone): string {
  return cn('tabular', FACE_TEXT[size], TONE_TEXT[tone]);
}

export function TickingTime({
  source,
  live,
  size,
  tone = 'default',
  hundredths = null,
  ms: shared,
}: TickingTimeProps): ReactNode {
  const own = useTickingMs(source, live && shared === undefined);
  const ms = shared ?? own;
  const ticking = live && source.since !== null;
  const hours = useSecondOf((now) => hourDigitsOf(tickValueAt(source, now)), ticking);
  const places = facePlacesOf(hours, hundredths !== null);
  const split = places.findIndex((place) => place.key === 'sc');
  const main = split < 0 ? places : places.slice(0, split);
  const rest = split < 0 ? [] : places.slice(split);
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-end"
    >
      {main.map((place) => (
        <Place key={place.key} place={place} ms={ms} className={classOf(size, tone)} />
      ))}
      {hundredths === null
        ? null
        : rest.map((place) => (
            <Place
              key={place.key}
              place={place}
              ms={ms}
              className={classOf(hundredths, 'variant')}
            />
          ))}
    </View>
  );
}

function faceLabelOf(stopwatch: PlannerStopwatchRow | null): string {
  if (stopwatch === null || (!stopwatch.running && stopwatch.accumulated_ms === 0)) {
    return 'Stopwatch at 0:00.00';
  }
  if (stopwatch.running) return 'Stopwatch running';
  return `Stopwatch paused at ${lapTime(stopwatch.accumulated_ms)}`;
}

function LapLine({
  stopwatch,
  live,
  compact,
}: {
  readonly stopwatch: PlannerStopwatchRow;
  readonly live: boolean;
  readonly compact: boolean;
}): ReactNode {
  const best = bestLapOf(stopwatch.laps);
  const lap = `Lap ${String(stopwatch.laps.length + 1)} · `;
  return (
    <View
      accessible
      accessibilityLabel={
        best === null
          ? `Lap ${String(stopwatch.laps.length + 1)}`
          : `${lap}best ${lapTime(best.split_ms)}`
      }
      className="flex-row items-end"
    >
      <Text variant="footnote" tone="variant">
        {lap}
      </Text>
      <TickingTime
        source={currentLapSourceOf(stopwatch)}
        live={live}
        size="footnote"
        tone="variant"
        hundredths="footnote"
      />
      {compact || best === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {` · best ${lapTime(best.split_ms)}`}
        </Text>
      )}
    </View>
  );
}

export function StopwatchFace({
  stopwatch,
  compact,
}: {
  readonly stopwatch: PlannerStopwatchRow | null;
  readonly compact: boolean;
}): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const started = stopwatch !== null && (stopwatch.running || stopwatch.accumulated_ms > 0);
  return (
    <View ref={ref} onLayout={onLayout} className="items-center gap-2">
      <View accessible accessibilityRole="timer" accessibilityLabel={faceLabelOf(stopwatch)}>
        <TickingTime source={stopwatchSourceOf(stopwatch)} live={live} size="xl" hundredths="l" />
      </View>
      {stopwatch !== null && started ? (
        <LapLine stopwatch={stopwatch} live={live} compact={compact} />
      ) : (
        <Text variant="footnote" tone="variant">
          Runs on the hub, so every device shows the same time.
        </Text>
      )}
    </View>
  );
}
