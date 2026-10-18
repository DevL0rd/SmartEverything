import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { offersAction } from '../data/computer-device';
import type { ComputerStatus } from '../model/computer-view';
import { BatteryChip, Ident, StateLine } from './card-parts';
import { WakeIconButton } from './face-controls';

function Identity({
  device,
  status,
  compact,
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
  readonly compact: boolean;
}): ReactNode {
  return (
    <>
      <Ident device={device} />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {device.label}
        </Text>
        <StateLine deviceId={device.id} status={status} temperature={!compact} />
      </View>
      <BatteryChip deviceId={device.id} />
    </>
  );
}

export function FaceHeader({
  device,
  status,
  compact = false,
  wake = false,
  actions = null,
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
  readonly compact?: boolean;
  readonly wake?: boolean;
  readonly actions?: ReactNode;
}): ReactNode {
  const action =
    wake && status.offline && offersAction(device, 'wake') ? (
      <WakeIconButton device={device} />
    ) : status.offline ? null : (
      actions
    );
  if (action === null) {
    return (
      <View className="flex-row items-center gap-2.5" pointerEvents="none">
        <Identity device={device} status={status} compact={compact} />
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-2.5" pointerEvents="box-none">
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5" pointerEvents="none">
        <Identity device={device} status={status} compact={compact} />
      </View>
      {action}
    </View>
  );
}
