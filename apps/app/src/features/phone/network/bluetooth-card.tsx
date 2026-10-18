import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { LockLine, NeedLine } from '../screens/detail-parts';
import { bluetoothIcon, bluetoothName, type Bluetooth } from './network-model';

function BatteryBar({
  name,
  percent,
}: {
  readonly name: string;
  readonly percent: number;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="w-12">
        <ProgressBar
          progress={percent / 100}
          colour={percent < 25 ? 'warning' : 'positive'}
          label={`${name} battery ${String(percent)} percent`}
        />
      </View>
      <Text variant="caption" tone="variant" className="tabular">
        {`${String(percent)} %`}
      </Text>
    </View>
  );
}

function DeviceRow({ device }: { readonly device: Bluetooth }): ReactNode {
  const name = bluetoothName(device);
  return (
    <View className="min-h-touch-min flex-row items-center gap-3">
      <Icon name={bluetoothIcon(device.kind)} size={20} tone="variant" />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {name}
      </Text>
      {device.batteryPercent === null ? null : (
        <BatteryBar name={name} percent={device.batteryPercent} />
      )}
    </View>
  );
}

export function BluetoothCard({
  devices,
  hidden,
  person,
  needsPermission,
}: {
  readonly devices: readonly Bluetooth[];
  readonly hidden: boolean;
  readonly person: string;
  readonly needsPermission: boolean;
}): ReactNode {
  return (
    <Card
      title="Bluetooth"
      icon="bluetooth"
      action={
        <Text variant="footnote" tone="variant">{`${String(devices.length)} connected`}</Text>
      }
    >
      {devices.map((device) => (
        <DeviceRow key={`${device.kind}-${device.name ?? ''}`} device={device} />
      ))}
      {devices.length === 0 && !hidden && !needsPermission ? (
        <Text variant="callout" tone="variant">
          Nothing connected
        </Text>
      ) : null}
      {needsPermission ? (
        <NeedLine text="Allow Bluetooth access on the phone to see connected devices" />
      ) : null}
      {hidden ? <LockLine text={`Device names stay with ${person}`} /> : null}
    </Card>
  );
}
