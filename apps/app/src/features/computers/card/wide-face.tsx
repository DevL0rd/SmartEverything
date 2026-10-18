import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Device } from '../../../store/state';
import type { ComputerStatus } from '../model/computer-view';
import { NetworkTile } from './card-text';
import { QuickIcons } from './face-controls';
import { FaceHeader } from './face-header';
import { VitalRow, type TileLooks } from './vital-parts';

const SPARK = 36;

const LOOKS: TileLooks = {
  cpu: { spark: SPARK, inline: false },
  gpu: { spark: SPARK, inline: false },
  ram: { spark: SPARK, inline: false },
};

export function WideFace({
  device,
  status,
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
}): ReactNode {
  const stale = status.offline;
  return (
    <View className="flex-1 gap-1" pointerEvents="box-none">
      <FaceHeader
        device={device}
        status={status}
        compact
        wake
        actions={<QuickIcons device={device} mute />}
      />
      <VitalRow
        deviceId={device.id}
        stale={stale}
        looks={LOOKS}
        className="min-h-0 flex-1 flex-row gap-5"
        extra={
          <NetworkTile deviceId={device.id} stale={stale} look={{ spark: SPARK, inline: false }} />
        }
      />
    </View>
  );
}
