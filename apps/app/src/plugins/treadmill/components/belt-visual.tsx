import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  DeviceVisual,
  useDeviceVisualState,
  type VisualPx,
  type VisualSize,
} from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import { useLiveSelect } from '../data/treadmill-data';
import { useMaxHeartRateSetting } from '../../../features/fitness/data/goals';
import { treadmillFactsOf, treadmillLabel, treadmillVisualState } from '../model/live-visual';

export function BeltVisual({
  device,
  view,
  size = 'hero',
  px,
}: {
  readonly device: Device;
  readonly view: TreadmillStateView;
  readonly size?: VisualSize;
  readonly px?: VisualPx;
}): ReactNode {
  const base = useDeviceVisualState(device);
  const frame = useLiveSelect(device.id, view.frame, (live) => live);
  const maxBpm = useMaxHeartRateSetting();
  const facts = treadmillFactsOf(frame, view.fault, maxBpm);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={treadmillLabel(facts)}>
      <DeviceVisual
        device={device}
        size={size}
        state={treadmillVisualState(base, facts)}
        {...(px === undefined ? {} : { px })}
      />
    </View>
  );
}
