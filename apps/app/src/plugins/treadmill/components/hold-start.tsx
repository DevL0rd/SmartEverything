import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { DURATION } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import { HOLD_TO_START_MS } from '../model/treadmill-model';

const ACTIVATE = [{ name: 'activate', label: 'Start the belt' }] as const;

export interface HoldStartProps {
  readonly enabled: boolean;
  readonly reason: string | null;
  readonly onStart: () => void;
}

interface Hold {
  readonly holding: boolean;
  readonly progress: SharedValue<number>;
  readonly begin: () => void;
  readonly cancel: () => void;
}

function HoldFill({ progress }: { readonly progress: SharedValue<number> }): ReactNode {
  const fill = useAnimatedStyle(() => ({
    transformOrigin: 'left',
    transform: [{ scaleX: progress.get() }],
  }));
  return (
    <Animated.View
      className="h-full w-full border-r-2 border-on-primary bg-on-primary/25"
      style={fill}
    />
  );
}

function useHold(onStart: () => void): Hold {
  const progress = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const complete = useCallback((): void => {
    setHolding(false);
    progress.set(0);
    AccessibilityInfo.announceForAccessibility('Starting the belt');
    onStart();
  }, [onStart, progress]);
  const begin = useCallback((): void => {
    setHolding(true);
    AccessibilityInfo.announceForAccessibility('Holding the start button for one second');
    progress.set(
      withTiming(1, { duration: HOLD_TO_START_MS, easing: Easing.linear }, (finished) => {
        if (finished === true) {
          scheduleOnRN(complete);
        }
      }),
    );
  }, [complete, progress]);
  const cancel = useCallback((): void => {
    cancelAnimation(progress);
    progress.set(withTiming(0, { duration: DURATION.short }));
    setHolding(false);
  }, [progress]);
  return { holding, progress, begin, cancel };
}

export function HoldStart({ enabled, reason, onStart }: HoldStartProps): ReactNode {
  const { holding, progress, begin, cancel } = useHold(onStart);
  const radius = useIdiom() === 'pointer' ? 'rounded-sm' : 'rounded-full';
  return (
    <View className="gap-2">
      <Interactive
        role="button"
        label="Start the belt"
        hint="Hold for one second"
        disabled={!enabled}
        onPressIn={begin}
        onPressOut={cancel}
        accessibilityActions={ACTIVATE}
        onAccessibilityAction={begin}
        onTone="primary"
        className={cn(
          'min-h-touch-min flex-1 overflow-hidden px-6',
          radius,
          enabled ? 'bg-primary' : 'bg-on-surface/10',
        )}
        layerClassName={radius}
      >
        <View pointerEvents="none" className="absolute inset-0 flex-row">
          <HoldFill progress={progress} />
        </View>
        <View className="min-h-touch-min flex-row items-center justify-center gap-2">
          <Icon name="play" size={20} tone={enabled ? 'onPrimary' : 'faint'} />
          <Text variant="label" tone={enabled ? 'onPrimary' : 'faint'} numberOfLines={1}>
            {holding ? 'Keep holding…' : 'Hold to start'}
          </Text>
        </View>
      </Interactive>
      {reason === null ? null : (
        <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
          {reason}
        </Text>
      )}
    </View>
  );
}
