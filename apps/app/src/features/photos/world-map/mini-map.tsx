import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { viewAround, type GeoPoint } from './projection';
import { useMapFrame } from './use-map-frame';
import { WorldBase } from './world-base';

export const MINI_MAP_SPAN_DEGREES = 43;

export interface MiniMapProps {
  readonly point: GeoPoint;
  readonly label: string;
  readonly className?: string | undefined;
}

function Pin(): ReactNode {
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <View className="size-7 items-center justify-center rounded-full bg-primary/30">
        <View className="size-3 rounded-full border border-surface-1 bg-primary" />
      </View>
    </View>
  );
}

export function MiniMap({ point, label, className }: MiniMapProps): ReactNode {
  const { ref, frame, onLayout } = useMapFrame();
  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className={cn('overflow-hidden bg-surface-1', className)}
    >
      {frame === null ? null : (
        <WorldBase view={viewAround(point, MINI_MAP_SPAN_DEGREES, frame)} frame={frame} />
      )}
      <Pin />
    </View>
  );
}
