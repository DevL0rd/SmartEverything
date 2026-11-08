import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Glow } from '../../../components/glow';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { DURATION } from '../../../design/motion';
import { playTime } from '../../../format/time';
import type { HoldZone } from './recorder-hold';
import { LiveWave } from './recorder-live-wave';
import { HOLD_WAVE } from './recorder-wave-model';

const HALO_REST = 0.7;
const HALO_REACH = 0.5;
const SHAKE_PX = 6;
const CAPTION_READ_MS = 1500;

export interface HoldStripProps {
  readonly micOffset: number;
  readonly zone: HoldZone;
  readonly short: boolean;
  readonly seconds: number;
  readonly level: SharedValue<number>;
  readonly elapsedMs: SharedValue<number>;
  readonly reduced: boolean;
  readonly onShortShown: () => void;
}

function Halo({ level }: { readonly level: SharedValue<number> }): ReactNode {
  const swell = useAnimatedStyle(() => ({
    opacity: HALO_REST + (1 - HALO_REST) * level.get(),
    transform: [{ scale: 1 + HALO_REACH * level.get() }],
  }));
  return (
    <Animated.View pointerEvents="none" style={swell} className="absolute -inset-2.5">
      <Glow colour="critical" x="50%" y="50%" radius="50%" strength={0.4} />
    </Animated.View>
  );
}

function SwelledMic({
  level,
  reduced,
}: {
  readonly level: SharedValue<number>;
  readonly reduced: boolean;
}): ReactNode {
  return (
    <View className="-mr-1.5 size-14">
      {reduced ? null : <Halo level={level} />}
      <View className="absolute inset-0 items-center justify-center rounded-full bg-critical">
        <Icon name="mic" size={24} tone="onPrimary" />
      </View>
    </View>
  );
}

function HoldingRow(props: HoldStripProps): ReactNode {
  const cancelling = props.zone === 'cancel';
  return (
    <>
      {cancelling ? (
        <Icon name="trash" size={20} tone="critical" />
      ) : (
        <View className="size-2 rounded-full bg-critical" />
      )}
      <Text variant="body-strong" tone={cancelling ? 'critical' : 'default'} className="tabular">
        {playTime(props.seconds)}
      </Text>
      {cancelling ? (
        <View className="min-w-0 flex-1" />
      ) : (
        <LiveWave
          level={props.level}
          elapsedMs={props.elapsedMs}
          shape={HOLD_WAVE}
          fade={false}
          className="h-7 flex-1"
        />
      )}
      <Text variant="footnote" tone={cancelling ? 'critical' : 'variant'} numberOfLines={1}>
        {cancelling ? 'Release to cancel' : '‹ Slide to cancel'}
      </Text>
      <SwelledMic level={props.level} reduced={props.reduced} />
    </>
  );
}

function ShortRow({
  reduced,
  onShortShown,
}: Pick<HoldStripProps, 'reduced' | 'onShortShown'>): ReactNode {
  const shift = useSharedValue(0);
  const shown = useSharedValue(1);
  useEffect(() => {
    if (!reduced) {
      const step = { duration: DURATION.fast / 2 };
      shift.set(
        withSequence(
          withTiming(-SHAKE_PX, step),
          withTiming(SHAKE_PX, step),
          withTiming(-SHAKE_PX / 2, step),
          withTiming(0, step),
        ),
      );
    }
    shown.set(
      withDelay(
        CAPTION_READ_MS,
        withTiming(0, { duration: DURATION.medium }, (done) => {
          if (done === true) scheduleOnRN(onShortShown);
        }),
      ),
    );
  }, [reduced, shift, shown, onShortShown]);
  const shake = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateX: shift.get() }],
  }));
  return (
    <Animated.View style={shake} className="flex-row items-center gap-2" aria-live="polite">
      <Icon name="info" size={20} tone="variant" />
      <Text variant="footnote" tone="variant">
        Hold a little longer to record
      </Text>
    </Animated.View>
  );
}

function LockBadge(): ReactNode {
  return (
    <View
      pointerEvents="none"
      className="absolute bottom-16 right-0.5 h-24 w-10 items-center justify-between rounded-full border-hairline border-outline-variant bg-surface-raised py-3 elevation-3"
    >
      <Icon name="lock" size={16} tone="variant" />
      <View className="opacity-60">
        <Icon name="arrowUp" size={16} tone="variant" />
      </View>
    </View>
  );
}

export function HoldStrip(props: HoldStripProps): ReactNode {
  const { micOffset } = props;
  const reach = useAnimatedStyle(() => ({ left: -micOffset }), [micOffset]);
  return (
    <>
      {props.short ? null : <LockBadge />}
      <Animated.View
        pointerEvents="none"
        style={reach}
        className="absolute -top-1 right-0 h-13 flex-row items-center gap-2.5 rounded-full border-hairline border-outline-variant bg-surface-1 pl-4"
      >
        {props.short ? (
          <ShortRow reduced={props.reduced} onShortShown={props.onShortShown} />
        ) : (
          <HoldingRow {...props} />
        )}
      </Animated.View>
    </>
  );
}
