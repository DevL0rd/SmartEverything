import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import type { ComputerStatus } from '../model/computer-view';
import { BatteryChip, Ident, StateLine } from './card-parts';

export function FaceHeader({
  device,
  status,
  compact = false,
  className = '',
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
  readonly compact?: boolean;
  readonly className?: string;
}): ReactNode {
  return (
    <View className={cn('flex-row items-center gap-2.5', className)} pointerEvents="none">
      <Ident device={device} size="m" />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {device.label}
        </Text>
        <StateLine deviceId={device.id} status={status} temperature={!compact} />
      </View>
      <BatteryChip deviceId={device.id} />
    </View>
  );
}

export function FaceLine({
  device,
  status,
}: {
  readonly device: Device;
  readonly status: ComputerStatus;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2" pointerEvents="none">
      <Ident device={device} size="s" />
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 shrink">
        {device.label}
      </Text>
      <View className="ml-auto shrink-0 flex-row items-center gap-2">
        <StateLine deviceId={device.id} status={status} temperature={false} />
        <BatteryChip deviceId={device.id} />
      </View>
    </View>
  );
}
