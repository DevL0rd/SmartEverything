import { useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cn } from '../design/cn';
import { DURATION, EASING, SPRING } from '../design/motion';
import { isNative, useIdiom } from '../design/platform';
import { SHEET_GRABBER } from './compact-panel';
import { Interactive } from './interactive';
import {
  cycleDetent,
  dragPlan,
  snapDetent,
  stepDetent,
  type OpenDetent,
  type PullUpDetent,
} from './pull-up-math';

export interface PullUpHeights {
  readonly host: number;
  readonly height: SharedValue<number>;
  readonly settled: SharedValue<number>;
  readonly onClosed: () => void;
}

function useHandleDrag(
  heights: PullUpHeights,
  settle: (target: PullUpDetent) => void,
  returnDetent: OpenDetent | null,
): ReturnType<typeof Gesture.Pan> {
  const { host, height, settled, onClosed } = heights;
  const start = useSharedValue(0);
  return Gesture.Pan()
    .onBegin(() => {
      start.set(height.get());
    })
    .onUpdate((event) => {
      height.set(Math.min(Math.max(start.get() - event.translationY, 0), host));
    })
    .onEnd((event) => {
      const target = snapDetent(height.get(), event.velocityY, host);
      const planned = target === 'peek' && returnDetent !== null ? returnDetent : target;
      const { rest, closes } = dragPlan(planned, host);
      settled.set(rest);
      if (closes) {
        height.set(
          withTiming(
            rest,
            { duration: DURATION.mediumOut, easing: EASING.accelerate },
            (finished) => {
              'worklet';
              if (finished === true) {
                scheduleOnRN(onClosed);
              }
            },
          ),
        );
      } else {
        height.set(withSpring(rest, { ...SPRING, velocity: -event.velocityY }));
      }
      scheduleOnRN(settle, target);
    });
}

function useHandleKeys(
  node: RefObject<View | null>,
  current: OpenDetent,
  settle: (target: PullUpDetent) => void,
): void {
  const press = useEffectEvent((key: string) => {
    if (key === 'ArrowUp') settle(stepDetent(current, 'taller'));
    if (key === 'ArrowDown') settle(stepDetent(current, 'shorter'));
  });
  useEffect(() => {
    const root = node.current;
    if (isNative() || !(root instanceof HTMLElement)) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (
        event.key.startsWith('Arrow') &&
        event.target instanceof Node &&
        root.contains(event.target)
      ) {
        event.preventDefault();
        press(event.key);
      }
    };
    root.addEventListener('keydown', listen);
    return (): void => {
      root.removeEventListener('keydown', listen);
    };
  }, [node]);
}

interface HandleProps {
  readonly label: string;
  readonly detent: OpenDetent;
  readonly heights: PullUpHeights;
  readonly settle: (target: PullUpDetent) => void;
  readonly nested: boolean;
}

export function PullUpHandle({ label, detent, heights, settle, nested }: HandleProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const node = useRef<View>(null);
  const drag = useHandleDrag(heights, settle, nested ? detent : null);
  useHandleKeys(node, detent, settle);
  return (
    <GestureDetector gesture={drag}>
      <View ref={node} collapsable={false}>
        <Interactive
          label={`${label} height`}
          hint="Press Enter to change the height. Arrow keys resize."
          onPress={() => {
            settle(cycleDetent(detent));
          }}
          className={cn('w-full items-center justify-center', touch ? 'h-touch-min' : 'h-6')}
        >
          <View className={touch ? SHEET_GRABBER : 'h-1 w-11 rounded-full bg-on-surface-faint'} />
        </Interactive>
      </View>
    </GestureDetector>
  );
}
