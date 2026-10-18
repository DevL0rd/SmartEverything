import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
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
import { useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import { decimalsOf, snap } from './charts/scale';
import { stepFormat } from './number-stepper';
import { useFocusedKeys } from './focused-keys';
import { useWheelSteps } from './slider-wheel';

type SliderOrientation = 'horizontal' | 'vertical';

export interface SliderProps {
  readonly value: number | null;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly label: string;
  readonly onChange?: (value: number) => void;
  readonly onCommit: (value: number) => void;
  readonly onCancel?: () => void;
  readonly disabled?: boolean;
  readonly unknownValue?: string;
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

const GESTURE_SLOP = 12;
const TRACK_CLASS = 'h-1.5 overflow-hidden rounded-full border-hairline border-track';
const SHIFT_MULTIPLIER = 10;

const KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 10,
  PageDown: -10,
};

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

function keyTarget(
  key: string,
  shift: boolean,
  value: number | null,
  props: SliderProps,
): number | null {
  if (key === 'Home') {
    return props.min;
  }
  if (key === 'End') {
    return props.max;
  }
  const steps = KEY_STEPS[key];
  if (steps === undefined) return null;
  const stride = shift ? SHIFT_MULTIPLIER : 1;
  return value === null ? props.min : snap(value + steps * stride * props.step, props, props.step);
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
  readonly gesture: ReturnType<typeof Gesture.Exclusive>;
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

function gestureOf(
  track: Track,
  enabled: boolean,
  move: (x: number, y: number) => void,
  finish: (success: boolean) => void,
): ReturnType<typeof Gesture.Exclusive> {
  const hitSlop = track.vertical ? { horizontal: 8 } : { vertical: 16, horizontal: 12 };
  const pan = Gesture.Pan()
    .enabled(enabled)
    .hitSlop(hitSlop)
    .onStart((event) => {
      move(event.x, event.y);
    })
    .onUpdate((event) => {
      move(event.x, event.y);
    })
    .onFinalize((_event, success) => {
      finish(success);
    });
  if (track.vertical) {
    pan.activeOffsetY([-GESTURE_SLOP, GESTURE_SLOP]).failOffsetX([-GESTURE_SLOP, GESTURE_SLOP]);
  } else {
    pan.activeOffsetX([-GESTURE_SLOP, GESTURE_SLOP]).failOffsetY([-GESTURE_SLOP, GESTURE_SLOP]);
  }
  const tap = Gesture.Tap()
    .enabled(enabled)
    .hitSlop(hitSlop)
    .maxDistance(GESTURE_SLOP)
    .onEnd((event, success) => {
      if (success) {
        move(event.x, event.y);
        finish(true);
      }
    });
  return Gesture.Exclusive(pan, tap);
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
  const settle = (next: number, success: boolean): void => {
    setDragged(null);
    if (success) props.onCommit(next);
    else {
      props.onCancel?.();
      position.set(shareOf(base, props.min, props.max));
    }
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
  const finish = (success: boolean): void => {
    'worklet';
    const next = last.get();
    last.set(null);
    if (next !== null) {
      scheduleOnRN(settle, next, success);
    }
  };
  return { gesture: gestureOf(track, props.disabled !== true, move, finish), position, length };
}

interface TrackProps {
  readonly position: SharedValue<number>;
  readonly length: SharedValue<number>;
  readonly disabled: boolean;
}

function HorizontalTrack({ position, length, disabled }: TrackProps): ReactNode {
  const fill = useAnimatedStyle(() => ({ width: position.get() * length.get() }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: position.get() * length.get() }],
  }));
  return (
    <>
      <View className={cn(TRACK_CLASS, disabled ? 'border-dashed' : 'bg-track')}>
        <Animated.View
          style={fill}
          className={cn('h-full rounded-full bg-primary', disabled && 'opacity-38')}
        />
      </View>
      <Animated.View
        style={thumb}
        className={cn(
          'absolute top-0 left-0 -ml-3 size-6 rounded-full border-2 border-surface-1 bg-primary elevation-1',
          disabled && 'opacity-38',
        )}
      />
    </>
  );
}

function VerticalTrack({ position, length }: Omit<TrackProps, 'disabled'>): ReactNode {
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
  const focus = useFocusedKeys(keyboard, (key, shift) =>
    nudge(keyTarget(key, shift, value, props)),
  );
  const onAction = (event: AccessibilityActionEvent): void => {
    const key = event.nativeEvent.actionName === 'increment' ? 'ArrowUp' : 'ArrowDown';
    nudge(props.disabled === true ? null : keyTarget(key, false, value, props));
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
    value: value ?? min,
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
): Drag & { readonly frame: RefObject<View | null>; readonly shown: number | null } {
  const frame = useRef<View>(null);
  const wheeled = useWheel(props, frame, keyboard);
  const [dragged, setDragged] = useState<number | null>(null);
  const base = wheeled ?? props.value;
  return {
    frame,
    shown: dragged ?? base,
    ...useDrag(props, dragged, setDragged, base ?? props.min),
  };
}

function SliderTrack({
  known,
  vertical,
  ...track
}: TrackProps & {
  readonly known: boolean;
  readonly vertical: boolean;
}): ReactNode {
  if (known) return vertical ? <VerticalTrack {...track} /> : <HorizontalTrack {...track} />;
  return (
    <View
      className={
        vertical
          ? 'w-1.5 flex-1 self-center rounded-full bg-track'
          : cn(TRACK_CLASS, 'border-dashed')
      }
    />
  );
}

function valueAccessibility(
  props: SliderProps,
  shown: number | null,
): Pick<
  ViewProps,
  'aria-valuemin' | 'aria-valuemax' | 'aria-valuenow' | 'aria-valuetext' | 'accessibilityValue'
> {
  const format = props.formatValue ?? stepFormat(props.step);
  const text = shown === null ? (props.unknownValue ?? 'Unknown') : format(shown);
  return {
    'aria-valuemin': props.min,
    'aria-valuemax': props.max,
    'aria-valuenow': shown ?? undefined,
    'aria-valuetext': text,
    accessibilityValue: {
      min: props.min,
      max: props.max,
      ...(shown === null ? {} : { now: shown }),
      text,
    },
  };
}

export function Slider(props: SliderProps): ReactNode {
  const { label, disabled = false, orientation = 'horizontal' } = props;
  const pointer = useIdiom() === 'pointer';
  const keyboard = pointer && !disabled;
  const { frame, shown, gesture, position, length } = useSliderState(props, keyboard);
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
      {...valueAccessibility(props, shown)}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      className={cn(
        'rounded-md focus:outline-2 focus:outline-offset-2 focus:outline-focus',
        vertical
          ? 'h-40 min-h-20 w-11 shrink py-2.5'
          : 'min-h-touch-min w-full min-w-24 justify-center px-3',
      )}
    >
      <GestureDetector gesture={gesture} touchAction={vertical ? 'pan-x' : 'pan-y'}>
        <View onLayout={measure} className={vertical ? 'flex-1' : 'h-6 justify-center'}>
          <SliderTrack
            known={shown !== null}
            vertical={vertical}
            position={position}
            length={length}
            disabled={disabled}
          />
        </View>
      </GestureDetector>
    </View>
  );
}
