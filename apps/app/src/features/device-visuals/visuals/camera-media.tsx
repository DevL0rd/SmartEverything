import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { CameraSnapshot } from '../media/camera-snapshot';
import type { VisualSize } from '../types';
import { SIZE_CLASS, useVisualPx } from '../visual-size';

const DOT: Readonly<Record<VisualSize, string>> = {
  tile: 'right-1 top-1 size-2',
  card: 'right-2 top-2 size-2.5',
  hero: 'right-3 top-3 size-3',
};

export function CameraMedia({
  device,
  size,
}: {
  readonly device: Device;
  readonly size: VisualSize;
}): ReactNode {
  const px = useVisualPx(size);
  return (
    <View
      pointerEvents="none"
      className={cn('relative shrink-0 overflow-hidden rounded-lg bg-surface-2', SIZE_CLASS[px])}
    >
      <CameraSnapshot
        deviceId={device.id}
        label={device.label}
        size={size === 'hero' ? 'full' : 'thumb'}
      />
      <View
        className={cn(
          'absolute rounded-full border-hairline border-outline',
          DOT[size],
          device.online ? 'bg-positive' : 'bg-on-surface-faint',
        )}
      />
    </View>
  );
}
