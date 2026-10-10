import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { WidgetSize } from '@smarteverything/domain';
import type { Cell } from '../board-geometry';
import type { SizeOption } from './edit-model';
import type { WidgetMotion } from './use-widget-motion';

export interface ResizeGestureInput {
  readonly key: string;
  readonly size: WidgetSize;
  readonly options: readonly SizeOption[];
  readonly cell: Cell;
  readonly motion: WidgetMotion;
  readonly onStart: (key: string) => void;
  readonly onSize: (key: string, size: WidgetSize) => void;
  readonly onEnd: () => void;
}

function nearest(options: readonly SizeOption[], columns: number, rows: number): WidgetSize | null {
  'worklet';
  let best: SizeOption | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const distance = Math.abs(option.columns - columns) + Math.abs(option.rows - rows);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best === null ? null : best.size;
}

export function useResizeGesture(input: ResizeGestureInput): PanGesture {
  const { key, size, options, cell, motion, onStart, onSize, onEnd } = input;
  const start = useSharedValue({ width: 0, height: 0 });
  const last = useSharedValue<WidgetSize>(size);
  return Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      start.set({ width: motion.width.get(), height: motion.height.get() });
      last.set(size);
      scheduleOnRN(onStart, key);
    })
    .onUpdate((event) => {
      const origin = start.get();
      const columns = (origin.width + event.translationX + cell.gap) / (cell.width + cell.gap);
      const rows = (origin.height + event.translationY + cell.gap) / (cell.height + cell.gap);
      const next = nearest(options, columns, rows);
      if (next !== null && next !== last.get()) {
        last.set(next);
        scheduleOnRN(onSize, key, next);
      }
    })
    .onFinalize(() => {
      scheduleOnRN(onEnd);
    });
}
