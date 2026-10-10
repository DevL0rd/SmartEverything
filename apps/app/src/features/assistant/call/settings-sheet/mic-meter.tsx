import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { VOICE_DETECTION, type VoiceDetection } from '@smarteverything/domain';
import { cn } from '../../../../design/cn';
import { DURATION, EASING, useMotion } from '../../../../design/motion';
import { callEngine } from '../engine/engine';

function useInputLevel(live: boolean): SharedValue<number> {
  const level = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      level.set(0);
      return undefined;
    }
    let frame = 0;
    const read = (): void => {
      level.set(callEngine.inputLevel());
      frame = requestAnimationFrame(read);
    };
    frame = requestAnimationFrame(read);
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [live, level]);
  return level;
}

export interface MicMeterProps {
  readonly detection: VoiceDetection;
  readonly live: boolean;
  readonly muted: boolean;
}

export function MicMeter({ detection, live, muted }: MicMeterProps): ReactNode {
  const motion = useMotion();
  const level = useInputLevel(live);
  const tick = useSharedValue(VOICE_DETECTION[detection].positiveSpeechThreshold);
  const width = useSharedValue(0);
  useEffect(() => {
    const target = VOICE_DETECTION[detection].positiveSpeechThreshold;
    tick.set(
      motion.reduced
        ? target
        : withTiming(target, { duration: DURATION.medium, easing: EASING.standard }),
    );
  }, [detection, motion.reduced, tick]);
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.min(1, Math.max(0, level.get())) }],
  }));
  const mark = useAnimatedStyle(() => ({ transform: [{ translateX: tick.get() * width.get() }] }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Microphone level"
      onLayout={(event) => {
        width.set(event.nativeEvent.layout.width);
      }}
      className="h-6 justify-center"
    >
      <View className="h-2 overflow-hidden rounded-full bg-on-surface/12">
        <Animated.View
          style={fill}
          className={cn(
            'h-2 w-full origin-left rounded-full',
            muted ? 'bg-on-surface-faint' : 'bg-primary',
          )}
        />
      </View>
      <Animated.View
        style={mark}
        className="absolute left-0 h-5 w-0.5 rounded-full bg-on-surface"
      />
    </View>
  );
}
