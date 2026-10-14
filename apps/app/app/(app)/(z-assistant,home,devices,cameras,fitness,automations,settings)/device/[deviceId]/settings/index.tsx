import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ExtendedDeviceSettingsScreen } from '../../../../../../src/features/device-list';

export default function DeviceSettingsScreenRoute(): ReactNode {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  return <ExtendedDeviceSettingsScreen key={deviceId} deviceId={deviceId} />;
}
