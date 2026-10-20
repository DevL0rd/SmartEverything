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
import { cn } from '../design/cn';
import { DURATION } from '../design/motion';
import { useIdiom } from '../design/platform';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';
import type { Tone } from './tone';

export const HOLD_MS = 1000;

interface HoldButtonProps {
  readonly label: string;
  readonly holdingLabel: string;
  readonly action: string;
  readonly icon: IconName;
  readonly enabled: boolean;
  readonly onHeld: () => void;
  readonly holdMs?: number;
  readonly quiet?: boolean;
  readonly grow?: boolean;
}

interface Hold {
  readonly holding: boolean;
  readonly progress: SharedValue<number>;
  readonly begin: () => void;
  readonly cancel: () => void;
}

function HoldFill({
  progress,
  quiet,
}: {
  readonly progress: SharedValue<number>;
  readonly quiet: boolean;
}): ReactNode {
  const fill = useAnimatedStyle(() => ({
    transformOrigin: 'left',
    transform: [{ scaleX: progress.get() }],
  }));
  return (
    <Animated.View
      className={
        quiet
          ? 'h-full w-full border-r-2 border-on-surface bg-on-surface/10'
          : 'h-full w-full border-r-2 border-on-primary bg-on-primary/25'
      }
      style={fill}
    />
  );
}

function useHold(action: string, holdMs: number, onHeld: () => void): Hold {
  const progress = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const complete = useCallback((): void => {
    setHolding(false);
    progress.set(0);
    AccessibilityInfo.announceForAccessibility(action);
    onHeld();
  }, [action, onHeld, progress]);
  const begin = useCallback((): void => {
    setHolding(true);
    progress.set(
      withTiming(1, { duration: holdMs, easing: Easing.linear }, (finished) => {
        if (finished === true) {
          scheduleOnRN(complete);
        }
      }),
    );
  }, [complete, holdMs, progress]);
  const cancel = useCallback((): void => {
    cancelAnimation(progress);
    progress.set(withTiming(0, { duration: DURATION.short }));
    setHolding(false);
  }, [progress]);
  return { holding, progress, begin, cancel };
}

function holdFrame({
  quiet,
  pointer,
  grow,
  enabled,
}: {
  readonly quiet: boolean;
  readonly pointer: boolean;
  readonly grow: boolean;
  readonly enabled: boolean;
}): string {
  if (!quiet) {
    return cn(
      'min-h-touch-min overflow-hidden rounded-full px-6',
      grow && 'flex-1',
      enabled ? 'bg-primary' : 'bg-on-surface/10',
    );
  }
  return cn(
    'overflow-hidden border border-outline px-6',
    grow && 'flex-1',
    pointer ? 'h-9.5 rounded-sm' : 'h-13.5 rounded-full',
  );
}

function HoldFace({
  icon,
  text,
  tone,
  quiet,
}: {
  readonly icon: IconName;
  readonly text: string;
  readonly tone: Tone;
  readonly quiet: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'flex-row items-center justify-center gap-2',
        quiet ? 'h-full' : 'min-h-touch-min',
      )}
    >
      <Icon name={icon} size={20} tone={tone} />
      <Text variant="label" tone={tone} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export function HoldButton({
  label,
  holdingLabel,
  action,
  icon,
  enabled,
  onHeld,
  holdMs = HOLD_MS,
  quiet = false,
  grow = true,
}: HoldButtonProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const { holding, progress, begin, cancel } = useHold(action, holdMs, onHeld);
  const faceTone: Tone = quiet ? 'default' : 'onPrimary';
  const activate = useCallback((): void => {
    AccessibilityInfo.announceForAccessibility(action);
    onHeld();
  }, [action, onHeld]);
  return (
    <Interactive
      role="button"
      label={label}
      hint="Hold for one second"
      disabled={!enabled}
      onPressIn={begin}
      onPressOut={cancel}
      accessibilityActions={[{ name: 'activate', label: action }]}
      onAccessibilityAction={activate}
      onTone={quiet ? 'surface' : 'primary'}
      className={holdFrame({ quiet, pointer, grow, enabled })}
      layerClassName={quiet && pointer ? 'rounded-sm' : 'rounded-full'}
    >
      <View pointerEvents="none" className="absolute inset-0 flex-row">
        <HoldFill progress={progress} quiet={quiet} />
      </View>
      <HoldFace
        icon={icon}
        text={holding ? holdingLabel : label}
        tone={enabled ? faceTone : 'faint'}
        quiet={quiet}
      />
    </Interactive>
  );
}
