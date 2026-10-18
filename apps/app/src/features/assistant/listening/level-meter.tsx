import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useMotion } from '../../../design/motion';
import { levelStore, useLevelOf } from './listening-level';
import { dbLabel, levelShare } from './listening-model';

const WARN_FROM = 0.75;
const HOT_FROM = 0.92;
const REDUCED_GAP_MS = 250;
const TWEEN_MS = 90;

function zone(
  share: SharedValue<number>,
  from: number,
  to: number,
  track: number,
): { width: number } {
  'worklet';
  return { width: Math.max(0, Math.min(share.get(), to) - from) * track };
}

function useShare(sourceKey: string, reduced: boolean): SharedValue<number> {
  const share = useSharedValue(0);
  useEffect(() => {
    let shownAt = 0;
    return levelStore.subscribe(() => {
      const reading = levelStore.get();
      const next = reading?.sourceKey === sourceKey ? levelShare(reading.dbfs) : 0;
      const now = Date.now();
      if (reduced && next !== 0 && now - shownAt < REDUCED_GAP_MS) return;
      shownAt = now;
      share.set(reduced ? next : withTiming(next, { duration: TWEEN_MS }));
    });
  }, [sourceKey, reduced, share]);
  return share;
}

function Fills({
  share,
  track,
}: {
  readonly share: SharedValue<number>;
  readonly track: number;
}): ReactNode {
  const calm = useAnimatedStyle(() => zone(share, 0, WARN_FROM, track));
  const warm = useAnimatedStyle(() => zone(share, WARN_FROM, HOT_FROM, track));
  const hot = useAnimatedStyle(() => zone(share, HOT_FROM, 1, track));
  return (
    <View className="absolute inset-0 flex-row" aria-hidden>
      <Animated.View style={calm} className="h-full bg-positive" />
      <Animated.View style={warm} className="h-full bg-warning" />
      <Animated.View style={hot} className="h-full bg-critical" />
    </View>
  );
}

function leftOf(left: number): { readonly left: number } {
  return { left };
}

function Readout({ sourceKey }: { readonly sourceKey: string }): ReactNode {
  const dbfs = useLevelOf(sourceKey);
  return (
    <Text variant="body-strong" className="tabular min-w-16" align="end">
      {dbfs === null ? '–' : dbLabel(dbfs)}
    </Text>
  );
}

function Track({
  share,
  live,
  lastWakeDbfs,
}: {
  readonly share: SharedValue<number>;
  readonly live: boolean;
  readonly lastWakeDbfs: number | null;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View
      role="meter"
      accessibilityLabel="Microphone level"
      onLayout={onLayout}
      className="relative h-7 overflow-hidden rounded-sm bg-surface-3"
    >
      {live ? <Fills share={share} track={width} /> : null}
      {live && lastWakeDbfs !== null ? (
        <View
          style={leftOf(levelShare(lastWakeDbfs) * width)}
          className="absolute inset-y-0 w-0.5 bg-on-surface"
          aria-hidden
        />
      ) : null}
    </View>
  );
}

function Scale({ why }: { readonly why: string }): ReactNode {
  return (
    <View className="flex-row justify-between gap-2">
      <Text variant="caption" tone="faint">
        {'\u221260 dB'}
      </Text>
      <Text variant="caption" tone="faint" align="center" className="flex-1" numberOfLines={1}>
        {why}
      </Text>
      <Text variant="caption" tone="faint">
        0 dB
      </Text>
    </View>
  );
}

export function LevelMeter({
  sourceKey,
  live,
  lastWakeDbfs,
  why,
}: {
  readonly sourceKey: string;
  readonly live: boolean;
  readonly lastWakeDbfs: number | null;
  readonly why: string;
}): ReactNode {
  const share = useShare(sourceKey, useMotion().reduced);
  return (
    <View className="gap-1.5">
      <View className="min-h-6 flex-row items-baseline justify-between">
        <Text variant="caption" tone="variant">
          {live ? 'Live level' : 'No live level'}
        </Text>
        {live ? <Readout sourceKey={sourceKey} /> : null}
      </View>
      <Track share={share} live={live} lastWakeDbfs={lastWakeDbfs} />
      <Scale why={why} />
      {live && lastWakeDbfs !== null ? (
        <View className="flex-row items-center gap-2">
          <View aria-hidden className="h-3 w-0.5 bg-on-surface" />
          <Text variant="caption" tone="variant">
            {`Your last wake here was ${dbLabel(lastWakeDbfs)}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
