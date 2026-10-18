import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { DisplayOutput } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { resolutionText, type Box, type Drop } from '../model/displays-model';
import { dropOf } from '../model/displays-model';

const DRAG_SLOP = 6;

const SHOW_DETAIL_WIDTH = 90;

interface MonitorProps {
  readonly box: Box;
  readonly output: DisplayOutput;
  readonly draggable: boolean;
  readonly onOpen: () => void;
  readonly onDrop: (dx: number, dy: number) => void;
}

function useDrag(
  draggable: boolean,
  onDrop: (dx: number, dy: number) => void,
): { readonly gesture: ReturnType<typeof Gesture.Pan>; readonly moved: object } {
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const gesture = Gesture.Pan()
    .enabled(draggable)
    .minDistance(DRAG_SLOP)
    .onUpdate((event) => {
      dx.set(event.translationX);
      dy.set(event.translationY);
    })
    .onEnd((event) => {
      scheduleOnRN(onDrop, event.translationX, event.translationY);
      dx.set(withTiming(0));
      dy.set(withTiming(0));
    });
  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.get() }, { translateY: dy.get() }],
  }));
  return { gesture, moved };
}

function detailOf(output: DisplayOutput): string {
  if (!output.enabled) return output.builtIn ? 'Built-in · not in use' : 'Not in use';
  const size = output.mode === null ? '' : resolutionText(output.mode);
  return output.primary ? `${size} · Primary` : size;
}

function Monitor({ box, output, draggable, onOpen, onDrop }: MonitorProps): ReactNode {
  const { gesture, moved } = useDrag(draggable, onDrop);
  const place = { left: box.left, top: box.top, width: box.width, height: box.height };
  const detail = detailOf(output);
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[place, moved]} className="absolute">
        <Interactive
          label={`${output.name}${output.primary ? ', primary' : ''}, ${detail}. ${draggable ? 'Drag to move, press to edit' : 'Tap to edit'}`}
          onPress={onOpen}
          className={cn(
            'size-full justify-center overflow-hidden rounded-sm border border-outline px-2',
            output.enabled ? 'bg-primary-container' : 'border-dashed bg-surface-2',
          )}
          layerClassName="rounded-sm"
        >
          <View className="flex-row items-center gap-1">
            {output.primary ? <Icon name="star" size={16} tone="primary" /> : null}
            <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
              {output.name}
            </Text>
          </View>
          {box.width > SHOW_DETAIL_WIDTH ? (
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </Interactive>
      </Animated.View>
    </GestureDetector>
  );
}

export function Arrangement({
  disabled,
  outputs,
  on,
  off,
  height,
  onOpen,
  onMove,
}: {
  readonly disabled: boolean;
  readonly outputs: readonly DisplayOutput[];
  readonly on: readonly Box[];
  readonly off: readonly Box[];
  readonly height: number;
  readonly onOpen: (id: string) => void;
  readonly onMove: (id: string, drop: Drop) => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const draggable = !disabled && pointer && on.length > 1;
  const canvas = { height };
  return (
    <View
      role="group"
      accessibilityLabel="Screen arrangement"
      style={canvas}
      className="w-full rounded-md bg-surface-2"
    >
      {[...on, ...off].map((box) => {
        const output = outputs.find((candidate) => candidate.id === box.id);
        if (output === undefined) return null;
        return (
          <Monitor
            key={box.id}
            box={box}
            output={output}
            draggable={draggable ? output.enabled : false}
            onOpen={() => {
              onOpen(box.id);
            }}
            onDrop={(dx, dy) => {
              const drop = dropOf(on, box.id, dx, dy);
              if (drop !== null) onMove(box.id, drop);
            }}
          />
        );
      })}
    </View>
  );
}
