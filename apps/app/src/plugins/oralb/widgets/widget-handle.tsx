import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { VisualPx } from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import { BrushVisual } from '../../toothbrush/components/brush-visual';
import { offsetStyle, sizeStyle } from '../charts/style';

const PIXELS: readonly VisualPx[] = [48, 72, 96, 128, 168, 220];
const SLIM = 0.24;

export function handlePxOf(body: number): VisualPx {
  return PIXELS.reduce<VisualPx>((best, px) => (px <= body ? px : best), 48);
}

export function WidgetHandle({
  device,
  view,
  body,
}: {
  readonly device: Device;
  readonly view: BrushStateView;
  readonly body: number;
}): ReactNode {
  const px = handlePxOf(body);
  const width = Math.round(px * SLIM);
  return (
    <View className="shrink-0 overflow-hidden" style={sizeStyle(width, px)}>
      <View style={[sizeStyle(px, px), offsetStyle(-(px - width) / 2, 0)]}>
        <BrushVisual device={device} view={view} px={px} />
      </View>
    </View>
  );
}
