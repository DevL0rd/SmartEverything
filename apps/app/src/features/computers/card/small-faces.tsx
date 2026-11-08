import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { ActionBand } from '../../../components/widget-board/action-band';
import type { Device } from '../../../store/state';
import type { ComputerStatus } from '../model/computer-view';
import { BatteryChip, Ident, StateLine } from './card-parts';
import { FaceBand } from './face-controls';
import { FaceHeader, FaceLine } from './face-header';
import { VitalLines } from './vitals';
import { VitalRow, type TileLooks } from './vital-parts';

interface TileProps {
  readonly device: Device;
  readonly status: ComputerStatus;
}

export function TileFace({ device, status }: TileProps): ReactNode {
  return (
    <View className="flex-1 gap-1" pointerEvents="box-none">
      <View className="min-h-0 flex-1 justify-between gap-1" pointerEvents="none">
        <View className="flex-row items-center justify-between">
          <Ident device={device} size="m" />
          <BatteryChip deviceId={device.id} />
        </View>
        <View>
          <Text variant="body-strong" numberOfLines={1}>
            {device.label}
          </Text>
          <VitalLines deviceId={device.id} stale={status.offline} small />
        </View>
        <StateLine deviceId={device.id} status={status} temperature={false} />
      </View>
      <ActionBand />
    </View>
  );
}

export function ExtraSmallFace({ device, status }: TileProps): ReactNode {
  return (
    <View className="flex-1 gap-1.5" pointerEvents="box-none">
      <FaceHeader device={device} status={status} compact />
      <View pointerEvents="none">
        <VitalLines deviceId={device.id} stale={status.offline} />
      </View>
      <FaceBand device={device} offline={status.offline} controls="none" />
    </View>
  );
}

const LOOKS: TileLooks = {
  cpu: { spark: 18, inline: true },
  gpu: { spark: 18, inline: true },
  ram: { spark: null, inline: true },
};

export function CardFace({ device, status }: TileProps): ReactNode {
  const stale = status.offline;
  return (
    <View className="flex-1 gap-1" pointerEvents="box-none">
      <FaceLine device={device} status={status} />
      <VitalRow deviceId={device.id} stale={stale} looks={LOOKS} dense />
      <FaceBand device={device} offline={stale} controls="volume" />
    </View>
  );
}
