import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useDevice } from '../../../store/selectors';
import { BrushVisual } from '../../toothbrush/components/brush-visual';
import { offsetStyle, sizeStyle } from '../charts/style';
import { HANDLE_COLUMN } from '../model/stage-model';

export function HandleBox({
  deviceId,
  view,
  px,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
  readonly px: 220 | 280;
}): ReactNode {
  const device = useDevice(deviceId);
  if (device === null) {
    return null;
  }
  return (
    <View className="overflow-hidden" style={sizeStyle(HANDLE_COLUMN, px)}>
      <View style={[sizeStyle(px, px), offsetStyle(-(px - HANDLE_COLUMN) / 2, 0)]}>
        <BrushVisual device={device} view={view} px={px} />
      </View>
    </View>
  );
}
