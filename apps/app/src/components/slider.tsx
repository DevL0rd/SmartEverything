import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cn } from '../design/cn';
import { DURATION, EASING, useMotion } from '../design/motion';
import { isNative, useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import { decimalsOf, snap } from './charts/scale';
import { stepFormat } from './number-stepper';
import { useWheelSteps } from './slider-wheel';

type SliderOrientation = 'horizontal' | 'vertical';

export interface SliderProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly label: string;
  readonly onChange?: (value: number) => void;
  readonly onCommit: (value: number) => void;
  readonly disabled?: boolean;
  readonly formatValue?: (value: number) => string;
  readonly orientation?: SliderOrientation;
}

interface Track {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly digits: number;
  readonly vertical: boolean;
}

const KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 10,
  PageDown: -10,
};

export function useFocusedKeys(
  active: boolean,
  onKey: (key: string) => boolean,
): { onFocus: () => void; onBlur: () => void } {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!active || !focused || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (onKey(event.key)) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [active, focused, onKey]);
  return {
    onFocus: (): void => {
      setFocused(true);
    },
    onBlur: (): void => {
      setFocused(false);
    },
  };
}

function shareOf(value: number, min: number, max: number): number {
  'worklet';
  return max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
}

function snapShare(share: number, track: Track): number {
  'worklet';
  const clamped = Math.min(1, Math.max(0, share));
  const steps = Math.round((clamped * (track.max - track.min)) / track.step);
  const value = Number((track.min + steps * track.step).toFixed(track.digits));
  return Math.min(track.max, Math.max(track.min, value));
}

function keyTarget(key: string, value: number, props: SliderProps): number | null {
  if (key === 'Home') {
    return props.min;
  }
  if (key === 'End') {
    return props.max;
  }
  const steps = KEY_STEPS[key];
  return steps === undefined ? null : snap(value + steps * props.step, props, props.step);
}

function usePosition(value: number, props: SliderProps, dragging: boolean): SharedValue<number> {
  const { reduced } = useMotion();
  const { min, max } = props;
  const position = useSharedValue(shareOf(value, min, max));
  useEffect(() => {
    if (dragging) {
      return;
    }
    const target = shareOf(value, min, max);
    position.set(
      reduced ? target : withTiming(target, { duration: DURATION.short, easing: EASING.standard }),
    );
  }, [value, min, max, dragging, reduced, position]);
  return position;
}

interface Drag {
  readonly pan: ReturnType<typeof Gesture.Pan>;
  readonly position: SharedValue<number>;
  readonly length: SharedValue<number>;
}

function trackOf(props: SliderProps): Track {
  return {
    min: props.min,
    max: props.max,
    step: props.step,
    digits: decimalsOf(props.step),
    vertical: props.orientation === 'vertical',
  };
}

function panOf(
  track: Track,
  enabled: boolean,
  move: (x: number, y: number) => void,
  finish: () => void,
): ReturnType<typeof Gesture.Pan> {
  return Gesture.Pan()
    .enabled(enabled)
    .minDistance(0)
    .hitSlop(track.vertical ? { horizontal: 8 } : { vertical: 16, horizontal: 12 })
    .onBegin((event) => {
      move(event.x, event.y);
    })
    .onUpdate((event) => {
      move(event.x, event.y);
    })
    .onFinalize(finish);
}

function useDrag(
  props: SliderProps,
  dragged: number | null,
  setDragged: (value: number | null) => void,
  base: number,
): Drag {
  const position = usePosition(base, props, dragged !== null);
  const length = useSharedValue(0);
  const last = useSharedValue<number | null>(null);
  const track = trackOf(props);
  const preview = (next: number): void => {
    setDragged(next);
    selectionTick();
    props.onChange?.(next);
  };
  const commit = (next: number): void => {
    setDragged(null);
    props.onCommit(next);
  };
  const move = (x: number, y: number): void => {
    'worklet';
    const size = Math.max(1, length.get());
    const next = snapShare(track.vertical ? 1 - y / size : x / size, track);
    position.set(shareOf(next, track.min, track.max));
    if (last.get() !== next) {
      last.set(next);
      scheduleOnRN(preview, next);
    }
  };
  const finish = (): void => {
    'worklet';
    const next = last.get();
    last.set(null);
    if (next !== null) {
      scheduleOnRN(commit, next);
    }
  };
  return { pan: panOf(track, props.disabled !== true, move, finish), position, length };
}

interface TrackProps {
  readonly position: SharedValue<number>;
  readonly length: SharedValue<number>;
}

function HorizontalTrack({ position, length }: TrackProps): ReactNode {
  const fill = useAnimatedStyle(() => ({ width: position.get() * length.get() }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: position.get() * length.get() }],
  }));
  return (
    <>
      <View className="h-1 overflow-hidden rounded-full bg-surface-3">
        <Animated.View style={fill} className="h-full rounded-full bg-primary" />
      </View>
      <Animated.View
        style={thumb}
        className="absolute top-0 left-0 -ml-3 size-6 rounded-full border-2 border-surface-1 bg-primary elevation-1"
      />
    </>
  );
}

function VerticalTrack({ position, length }: TrackProps): ReactNode {
  const fill = useAnimatedStyle(() => ({ height: position.get() * length.get() }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - position.get()) * length.get() }],
  }));
  return (
    <View className="flex-1 items-center">
      <View className="w-1.5 flex-1 justify-end overflow-hidden rounded-full bg-white/24">
        <Animated.View style={fill} className="w-full rounded-full bg-primary" />
      </View>
      <Animated.View
        style={thumb}
        className="absolute top-0 -mt-2.5 size-5 rounded-full bg-white elevation-1"
      />
    </View>
  );
}

interface Nudge {
  readonly focus: ReturnType<typeof useFocusedKeys>;
  readonly onAction: (event: AccessibilityActionEvent) => void;
}

function useNudge(props: SliderProps, keyboard: boolean): Nudge {
  const { value, onChange, onCommit } = props;
  const nudge = (next: number | null): boolean => {
    if (next === null) {
      return false;
    }
    if (next !== value) {
      onChange?.(next);
      onCommit(next);
    }
    return true;
  };
  const focus = useFocusedKeys(keyboard, (key) => nudge(keyTarget(key, value, props)));
  const onAction = (event: AccessibilityActionEvent): void => {
    const key = event.nativeEvent.actionName === 'increment' ? 'ArrowUp' : 'ArrowDown';
    nudge(props.disabled === true ? null : keyTarget(key, value, props));
  };
  return { focus, onAction };
}

function useWheel(
  props: SliderProps,
  frame: RefObject<View | null>,
  active: boolean,
): number | null {
  const [wheeled, setWheeled] = useState<number | null>(null);
  const { value, min, max, step, onChange, onCommit } = props;
  useWheelSteps(frame, active, {
    value,
    min,
    max,
    step,
    preview: (next) => {
      setWheeled(next);
      onChange?.(next);
    },
    commit: (next) => {
      setWheeled(null);
      if (next !== value) {
        onCommit(next);
      }
    },
  });
  return wheeled;
}

function useSliderState(
  props: SliderProps,
  keyboard: boolean,
): Drag & { readonly frame: RefObject<View | null>; readonly shown: number } {
  const frame = useRef<View>(null);
  const wheeled = useWheel(props, frame, keyboard);
  const [dragged, setDragged] = useState<number | null>(null);
  const base = wheeled ?? props.value;
  return { frame, shown: dragged ?? base, ...useDrag(props, dragged, setDragged, base) };
}

export function Slider(props: SliderProps): ReactNode {
  const { min, max, step, label, disabled = false, orientation = 'horizontal' } = props;
  const formatValue = props.formatValue ?? stepFormat(step);
  const pointer = useIdiom() === 'pointer';
  const keyboard = pointer && !disabled;
  const { frame, shown, pan, position, length } = useSliderState(props, keyboard);
  const vertical = orientation === 'vertical';
  const { focus, onAction } = useNudge(props, keyboard);
  const measure = (event: LayoutChangeEvent): void => {
    length.set(vertical ? event.nativeEvent.layout.height : event.nativeEvent.layout.width);
  };
  return (
    <View
      ref={frame}
      accessible
      focusable={keyboard}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      aria-disabled={disabled}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={formatValue(shown)}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      className={cn(
        'rounded-md focus:outline-2 focus:outline-offset-2 focus:outline-focus',
        vertical ? 'h-40 min-h-20 w-11 shrink py-2.5' : 'min-h-touch-min justify-center px-3',
        disabled && 'opacity-40',
      )}
    >
      <GestureDetector gesture={pan}>
        <View onLayout={measure} className={vertical ? 'flex-1' : 'h-6 justify-center'}>
          {vertical ? (
            <VerticalTrack position={position} length={length} />
          ) : (
            <HorizontalTrack position={position} length={length} />
          )}
        </View>
      </GestureDetector>
    </View>
  );
}
