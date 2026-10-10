import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { DURATION, EASING, useMotion } from '../design/motion';
import { selectionTick } from '../platform/haptics';

export interface SwitchProps {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly mixed?: boolean;
}

const TRAVEL = 20;

export function SwitchTrack({
  value,
  mixed = false,
}: {
  readonly value: boolean;
  readonly mixed?: boolean;
}): ReactNode {
  const { reduced } = useMotion();
  const position = useSharedValue(value ? TRAVEL : 0);
  useEffect(() => {
    const target = value ? TRAVEL : 0;
    position.set(
      reduced ? target : withTiming(target, { duration: DURATION.short, easing: EASING.standard }),
    );
  }, [value, reduced, position]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: position.get() }] }));
  return (
    <View
      aria-hidden
      className={cn(
        'h-8 w-13 justify-center rounded-full border-2 px-0.5',
        value ? 'border-primary bg-primary' : 'border-outline bg-surface-3',
      )}
    >
      <Animated.View
        style={thumb}
        className={cn(
          'size-6 items-center justify-center rounded-full',
          value ? 'bg-on-primary' : 'bg-on-surface-variant',
        )}
      >
        {mixed ? <View className="h-0.5 w-3 rounded-full bg-surface-3" /> : null}
      </Animated.View>
    </View>
  );
}

export function Switch({
  value,
  onChange,
  label,
  disabled = false,
  mixed = false,
}: SwitchProps): ReactNode {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: mixed ? 'mixed' : value, disabled }}
      disabled={disabled}
      onPress={() => {
        selectionTick();
        onChange(!value);
      }}
      className={cn('min-h-touch-min justify-center', disabled && 'opacity-40')}
    >
      <SwitchTrack value={value} mixed={mixed} />
    </Pressable>
  );
}
