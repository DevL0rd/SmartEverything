import { useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SPRING, useMotion } from '../design/motion';
import { heavyThud, selectionTick, warningBuzz } from '../platform/haptics';
import { NO_SLOT, barTarget, movedPastSlop, shiftOffset, type BarShape } from './nav-bar-drag';
import type { FoldKind } from './nav-fold';
import { useHoverTarget } from './use-hover-target';

const HOLD_MS = 300;
const LIFT_SCALE = 1.06;
const LIFTED_Z = 10;

export interface BarDrag {
  readonly from: SharedValue<number>;
  readonly to: SharedValue<number>;
  readonly dx: SharedValue<number>;
  readonly columnWidth: SharedValue<number>;
  readonly shape: SharedValue<BarShape>;
  readonly into: SharedValue<number>;
  readonly armed: SharedValue<number>;
  readonly hover: (slot: number) => void;
}

export function useBarDrag(
  shape: BarShape,
  innerWidth: number,
  foldOf: (from: number, into: number) => FoldKind,
): BarDrag {
  const from = useSharedValue(NO_SLOT);
  const to = useSharedValue(NO_SLOT);
  const dx = useSharedValue(0);
  const columnWidth = useSharedValue(0);
  const into = useSharedValue(NO_SLOT);
  const armed = useSharedValue(NO_SLOT);
  const target = useHoverTarget<number>((slot) => {
    if (foldOf(from.get(), slot) === 'refuse') {
      warningBuzz();
      return;
    }
    selectionTick();
    armed.set(slot);
  });
  const shared = useSharedValue(shape);
  const columns = shape.count + (shape.orb ? 1 : 0);
  useEffect(() => {
    shared.set({ count: shape.count, orb: shape.orb });
    columnWidth.set(columns === 0 ? 0 : innerWidth / columns);
  }, [shape.count, shape.orb, columns, innerWidth, shared, columnWidth]);
  const hover = (slot: number): void => {
    target.observe(slot === NO_SLOT ? null : slot);
    if (slot === NO_SLOT) armed.set(NO_SLOT);
  };
  return { from, to, dx, columnWidth, shape: shared, into, armed, hover };
}

export interface SlotRelease {
  readonly slot: number;
  readonly to: number;
  readonly moved: boolean;
  readonly into: number;
}

export interface SlotDrag {
  readonly gesture: PanGesture;
  readonly style: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
}

function finish(drag: BarDrag, committed: boolean): void {
  'worklet';
  if (committed) {
    drag.from.set(NO_SLOT);
    drag.to.set(NO_SLOT);
    drag.dx.set(0);
    return;
  }
  drag.dx.set(
    withSpring(0, SPRING, () => {
      drag.from.set(NO_SLOT);
      drag.to.set(NO_SLOT);
    }),
  );
}

function track(drag: BarDrag, slot: number, dx: number, hover: (slot: number) => void): void {
  'worklet';
  drag.dx.set(dx);
  const target = barTarget(slot, dx, drag.columnWidth.get(), drag.shape.get());
  drag.to.set(target.to);
  if (target.into === drag.into.get()) return;
  drag.into.set(target.into);
  scheduleOnRN(hover, target.into);
}

export function useSlotDrag(
  drag: BarDrag,
  slot: number,
  onRelease: (release: SlotRelease) => void,
): SlotDrag {
  const { reduced } = useMotion();
  const { hover } = drag;
  const gesture = Gesture.Pan()
    .activateAfterLongPress(HOLD_MS)
    .onStart(() => {
      drag.from.set(slot);
      drag.to.set(slot);
      drag.dx.set(0);
      scheduleOnRN(heavyThud);
    })
    .onUpdate((event) => {
      track(drag, slot, event.translationX, hover);
    })
    .onEnd((event) => {
      const to = drag.to.get();
      const into = drag.armed.get();
      scheduleOnRN(onRelease, { slot, to, moved: movedPastSlop(event.translationX), into });
      drag.into.set(NO_SLOT);
      scheduleOnRN(hover, NO_SLOT);
      finish(drag, to !== slot || into !== NO_SLOT);
    });
  const style = useAnimatedStyle<ViewStyle>(() => {
    const from = drag.from.get();
    if (from === NO_SLOT) return { transform: [{ translateX: 0 }, { scale: 1 }], zIndex: 0 };
    if (from === slot) {
      return {
        transform: [{ translateX: drag.dx.get() }, { scale: reduced ? 1 : LIFT_SCALE }],
        zIndex: LIFTED_Z,
      };
    }
    const offset = shiftOffset(slot, from, drag.to.get(), {
      columnWidth: drag.columnWidth.get(),
      shape: drag.shape.get(),
    });
    return {
      transform: [{ translateX: reduced ? offset : withSpring(offset, SPRING) }, { scale: 1 }],
      zIndex: 0,
    };
  });
  return { gesture, style };
}
