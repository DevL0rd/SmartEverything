import { useState, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, type ComposedGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { SPRING, useMotion } from '../../../design/motion';
import { clockOfMinutes } from '../../../format/time';
import { eventFill } from './event-block';
import {
  SNAP_MINUTES,
  dragActivation,
  liftFeedback,
  minuteAt,
  pixelsOf,
  stepFeedback,
  type MinuteSpan,
} from './grid-gestures';
import { DAY_MINUTES } from './time-grid-layout';

const TAP_SLOP = 4;

export interface SlotRange extends MinuteSpan {
  readonly date: string;
}

export interface Slot {
  readonly date: string;
  readonly minute: number;
}

export function slotMinute(minute: number): number {
  'worklet';
  return Math.min(DAY_MINUTES - SNAP_MINUTES, Math.floor(minute / SNAP_MINUTES) * SNAP_MINUTES);
}

export function spanBetween(anchor: number, minute: number): MinuteSpan {
  'worklet';
  const first = slotMinute(anchor);
  if (minute >= first) {
    const to = Math.ceil(minute / SNAP_MINUTES) * SNAP_MINUTES;
    return { from: first, to: Math.min(DAY_MINUTES, Math.max(first + SNAP_MINUTES, to)) };
  }
  return { from: slotMinute(minute), to: first + SNAP_MINUTES };
}

export function draftTimeOf(span: MinuteSpan): string {
  return `${clockOfMinutes(span.from)} to ${clockOfMinutes(span.to)}`;
}

export interface SlotLayerProps {
  readonly date: string;
  readonly hourHeight: SharedValue<number>;
  readonly minHeight: number;
  readonly touch: boolean;
  readonly draft: SlotRange | null;
  readonly onDraft: (draft: SlotRange | null) => void;
  readonly onCreate: (draft: SlotRange) => void;
  readonly onSlot: (slot: Slot) => void;
}

interface Ghost {
  readonly from: SharedValue<number>;
  readonly to: SharedValue<number>;
}

function settle(value: SharedValue<number>, to: number, reduced: boolean): void {
  'worklet';
  value.set(reduced ? to : withSpring(to, SPRING));
}

function useCreateGesture(
  props: SlotLayerProps,
  ghost: Ghost,
  onActive: (active: boolean) => void,
): ComposedGesture {
  const { reduced } = useMotion();
  const { date, hourHeight, touch } = props;
  const anchor = useSharedValue(0);
  const draftOf = (span: MinuteSpan): void => {
    props.onDraft({ date, ...span });
    stepFeedback();
  };
  const finish = (span: MinuteSpan | null): void => {
    onActive(false);
    if (span === null) props.onDraft(null);
    else props.onCreate({ date, ...span });
  };
  const slot = (minute: number): void => {
    props.onSlot({ date, minute });
  };
  const pan = dragActivation(touch)
    .onStart((event) => {
      const first = minuteAt(event.y - event.translationY, hourHeight.get());
      const span = spanBetween(first, minuteAt(event.y, hourHeight.get()));
      anchor.set(first);
      ghost.from.set(span.from);
      ghost.to.set(span.to);
      scheduleOnRN(liftFeedback, touch);
      scheduleOnRN(onActive, true);
      scheduleOnRN(draftOf, span);
    })
    .onUpdate((event) => {
      const span = spanBetween(anchor.get(), minuteAt(event.y, hourHeight.get()));
      if (span.from === ghost.from.get() && span.to === ghost.to.get()) return;
      settle(ghost.from, span.from, reduced);
      settle(ghost.to, span.to, reduced);
      scheduleOnRN(draftOf, span);
    })
    .onEnd((event, success) => {
      const span = spanBetween(anchor.get(), minuteAt(event.y, hourHeight.get()));
      scheduleOnRN(finish, success ? span : null);
    });
  const tap = Gesture.Tap()
    .maxDistance(TAP_SLOP)
    .onEnd((event, success) => {
      if (success) scheduleOnRN(slot, slotMinute(minuteAt(event.y, hourHeight.get())));
    });
  return Gesture.Exclusive(pan, tap);
}

function DraftBlock({
  ghost,
  draft,
  active,
  layer,
}: {
  readonly ghost: Ghost;
  readonly draft: SlotRange;
  readonly active: boolean;
  readonly layer: SlotLayerProps;
}): ReactNode {
  const { hourHeight, minHeight, touch } = layer;
  const placed = useAnimatedStyle<ViewStyle>(() => {
    const hour = hourHeight.get();
    return {
      top: pixelsOf(ghost.from.get(), hour),
      height: Math.max(minHeight, pixelsOf(ghost.to.get() - ghost.from.get(), hour)),
    };
  });
  const time = draftTimeOf(draft);
  const subtitle = active && touch ? 'Drag to set the end' : time;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`New event, ${time}`}
      style={placed}
      className={cn('absolute inset-x-0 pb-px', touch ? 'px-0.5' : 'px-1')}
    >
      <View className="flex-1 rounded-sm bg-surface-1">
        <View
          className={cn(
            'flex-1 overflow-hidden rounded-sm',
            touch ? 'px-1.5 py-1' : 'px-2 py-1',
            eventFill(null, true),
          )}
        >
          <Text variant="caption" numberOfLines={1}>
            New event
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {subtitle}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export function SlotLayer(props: SlotLayerProps): ReactNode {
  const from = useSharedValue(props.draft?.from ?? 0);
  const to = useSharedValue(props.draft?.to ?? 0);
  const ghost = { from, to };
  const [active, setActive] = useState(false);
  const gesture = useCreateGesture(props, ghost, setActive);
  const draft = props.draft?.date === props.date ? props.draft : null;
  return (
    <GestureDetector gesture={gesture}>
      <View className="absolute inset-0">
        {draft === null ? null : (
          <DraftBlock ghost={ghost} draft={draft} active={active} layer={props} />
        )}
      </View>
    </GestureDetector>
  );
}
