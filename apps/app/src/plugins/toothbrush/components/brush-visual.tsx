import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import {
  DeviceVisual,
  useDeviceVisualState,
  type VisualPx,
  type VisualSize,
} from '../../../features/device-visuals';
import { WideArt, useWideArt } from '../../../features/devices/card/wide-card';
import type { Device } from '../../../store/state';
import { useFrame } from '../data/brush-data';
import { brushVisualState } from '../model/live-visual';

interface BrushProps {
  readonly device: Device;
  readonly view: BrushStateView;
}

export function BrushVisual({
  device,
  view,
  size = 'hero',
  px,
}: BrushProps & {
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

export function BrushArt({ device, view }: BrushProps): ReactNode {
  const art = useWideArt();
  return (
    <WideArt cls={art.cls}>
      <BrushVisual device={device} view={view} size="card" px={art.px} />
    </WideArt>
  );
}
