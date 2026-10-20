import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import {
  DeviceVisual,
  useDeviceVisualState,
  type VisualPx,
  type VisualSize,
} from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import { useFrame } from '../data/brush-data';
import { brushVisualState } from '../model/live-visual';

export function BrushVisual({
  device,
  view,
  size = 'hero',
  px,
}: {
  readonly device: Device;
  readonly view: BrushStateView;
  readonly size?: VisualSize;
  readonly px?: VisualPx;
}): ReactNode {
  const base = useDeviceVisualState(device);
  const frame = useFrame(device.id, view.frame);
  return (
    <DeviceVisual
      device={device}
      size={size}
      state={brushVisualState(base, frame, view)}
      {...(px === undefined ? {} : { px })}
    />
  );
}
