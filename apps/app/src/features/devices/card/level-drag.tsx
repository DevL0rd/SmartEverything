import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  deviceFamily,
  type CapabilityRole,
  type PresentedCapability,
} from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { selectionTick } from '../../../platform/haptics';
import { useLiveControl } from '../../../store/use-live-control';
import { useControl } from '../../../store/control';
import { useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePrimaryControls } from '../controls/primary-controls';
import { LEVEL_ROLES } from '../model/card-facts';
import { powerStateOf, shownValue, useDeviceModel } from '../model/device-model';

const NONE: ReadonlySet<CapabilityRole> = new Set();
const SLOP = 12;

interface Range {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

function stepped(value: number, range: Range): number {
  const clamped = Math.min(range.max, Math.max(range.min, value));
  return Math.round((clamped - range.min) / range.step) * range.step + range.min;
}

function useLevel(device: Device): PresentedCapability | null {
  const model = useDeviceModel(device);
  const values = useDeviceValues(device.id);
  const level = usePrimaryControls(device, NONE).find(
    (presented) =>
      presented.capability.value.kind === 'number' &&
      presented.role !== null &&
      LEVEL_ROLES.has(presented.role),
  );
  return level !== undefined && powerStateOf(model, values) === 'on' ? level : null;
}

function useLevelPan(
  device: Device,
  level: PresentedCapability,
  range: Range,
  width: number,
): { readonly pan: ReturnType<typeof Gesture.Pan>; readonly draft: number | null } {
  const raw = useControl(device.id, level.key);
  const control = useLiveControl(device, level.key, raw, deviceFamily(device) === 'light');
  const [draft, setDraft] = useState<number | null>(null);
  const origin = useSharedValue(0);
  const current = typeof control.value === 'number' ? control.value : range.min;
  const valueAt = (dx: number): number =>
    stepped(origin.get() + (dx / Math.max(1, width)) * (range.max - range.min), range);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-SLOP, SLOP])
    .failOffsetY([-SLOP, SLOP])
    .onStart(() => {
      origin.set(current);
      selectionTick();
    })
    .onUpdate((event) => {
      const next = valueAt(event.translationX);
      setDraft(next);
      if (deviceFamily(device) === 'light') void control.set(next);
    })
    .onEnd((event, success) => {
      setDraft(null);
      if (success) void control.set(valueAt(event.translationX));
    });
  return { pan, draft };
}

function Dragger({
  device,
  level,
  range,
  onTap,
  children,
}: {
  readonly device: Device;
  readonly level: PresentedCapability;
  readonly range: Range;
  readonly onTap: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const [width, setWidth] = useState(0);
  const { pan, draft } = useLevelPan(device, level, range, width);
  const tap = Gesture.Tap().runOnJS(true).onEnd(onTap);
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        accessibilityHint={`Drag sideways to change ${level.label.toLowerCase()}`}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
      >
        {children}
        {draft === null ? null : (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View className="rounded-full bg-surface-raised px-4 py-2 elevation-2">
              <Text variant="title-3" className="tabular">
                {`${level.label} ${shownValue(level, draft)}`}
              </Text>
            </View>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

export function LevelDrag({
  device,
  onTap,
  children,
}: {
  readonly device: Device;
  readonly onTap: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const level = useLevel(device);
  const range = level?.capability.value;
  if (level === null || range?.kind !== 'number') {
    return children;
  }
  return (
    <Dragger device={device} level={level} range={range} onTap={onTap}>
      {children}
    </Dragger>
  );
}
