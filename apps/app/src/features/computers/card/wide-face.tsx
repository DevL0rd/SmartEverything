import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Device } from '../../../store/state';
import type { ComputerStatus } from '../model/computer-view';
import { NetworkTile } from './card-text';
import { FaceBand } from './face-controls';
import { FaceHeader } from './face-header';
import { VitalRow, type TileLook, type TileLooks } from './vital-parts';

export const WIDE_SPARK = 24;

const LOOK: TileLook = { spark: WIDE_SPARK, inline: false };

const LOOKS: TileLooks = { cpu: LOOK, gpu: LOOK, ram: LOOK };

export function WideFace({
  device,
  status,
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
}): ReactNode {
  const stale = status.offline;
  return (
    <View className="flex-1 gap-1.5" pointerEvents="box-none">
      <View className="min-h-0 flex-1 flex-row gap-5" pointerEvents="box-none">
        <FaceHeader device={device} status={status} compact className="min-w-0 flex-1 self-start" />
        <VitalRow
          deviceId={device.id}
          stale={stale}
          looks={LOOKS}
          className="min-w-0 flex-3 flex-row gap-5"
          extra={<NetworkTile deviceId={device.id} stale={stale} look={LOOK} />}
        />
      </View>
      <FaceBand device={device} offline={stale} controls="quick" />
    </View>
  );
}
