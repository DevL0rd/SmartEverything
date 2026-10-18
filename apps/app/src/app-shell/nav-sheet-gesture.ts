import { Gesture, type ComposedGesture, type PanGesture } from 'react-native-gesture-handler';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  commitNavSheetPhase,
  navSheetLift,
  navSheetStops,
  settleNavSheet,
  type NavSheetPhase,
  type NavSheetStops,
} from './nav-sheet-state';

const PROJECTION = 0.18;
const CLOSE_VELOCITY = 1200;
const ACTIVATE = 10;
const SIDEWAYS = 16;

function releasePhase(lift: number, velocityY: number, stops: NavSheetStops): NavSheetPhase {
  'worklet';
  if (velocityY > CLOSE_VELOCITY) {
    return 'closed';
  }
  const projected = lift - velocityY * PROJECTION;
  const toClosed = Math.abs(projected);
  const toHalf = Math.abs(projected - stops.half);
  const toFull = Math.abs(projected - stops.full);
  if (toClosed <= toHalf && toClosed <= toFull) {
    return 'closed';
  }
  return toHalf <= toFull ? 'open' : 'full';
}

function settleFromRelease(velocityY: number): void {
  'worklet';
  const phase = releasePhase(navSheetLift.get(), velocityY, navSheetStops.get());
  settleNavSheet(phase, -velocityY);
  scheduleOnRN(commitNavSheetPhase, phase);
}

export function useNavSheetPan(from: 'bar' | 'sheet'): PanGesture {
  const start = useSharedValue(0);
  const pan = Gesture.Pan()
    .onStart(() => {
      start.set(navSheetLift.get());
    })
    .onUpdate((event) => {
      const lift = start.get() - event.translationY;
      navSheetLift.set(Math.min(Math.max(lift, 0), navSheetStops.get().full));
    })
    .onEnd((event) => {
      settleFromRelease(event.velocityY);
    });
  return from === 'bar'
    ? pan.activeOffsetY(-ACTIVATE).failOffsetX([-SIDEWAYS, SIDEWAYS])
    : pan.activeOffsetY([-ACTIVATE, ACTIVATE]);
}

export interface ListDismiss {
  readonly gesture: ComposedGesture;
  readonly onScroll: ReturnType<typeof useAnimatedScrollHandler>;
}

export function useListDismiss(): ListDismiss {
  const scrollY = useSharedValue(0);
  const last = useSharedValue(0);
  const dragging = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  const pan = Gesture.Pan()
    .activeOffsetY([-ACTIVATE, ACTIVATE])
    .failOffsetX([-SIDEWAYS, SIDEWAYS])
    .onStart((event) => {
      last.set(event.translationY);
      dragging.set(false);
    })
    .onUpdate((event) => {
      const delta = event.translationY - last.get();
      last.set(event.translationY);
      if (!dragging.get() && (scrollY.get() > 0 || delta <= 0)) {
        return;
      }
      dragging.set(true);
      const lift = navSheetLift.get() - delta;
      navSheetLift.set(Math.min(Math.max(lift, 0), navSheetStops.get().full));
    })
    .onEnd((event) => {
      if (dragging.get()) {
        settleFromRelease(event.velocityY);
      }
    });
  return { gesture: Gesture.Simultaneous(pan, Gesture.Native()), onScroll };
}
