import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Device } from '../../../store/state';
import { DeviceNotifyCard } from '../laundry/notify';
import { MicrowaveHistory } from './history';

export function MicrowaveDetails({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="gap-section-gap">
      <MicrowaveHistory deviceId={device.id} />
      <DeviceNotifyCard device={device} />
    </View>
  );
}
