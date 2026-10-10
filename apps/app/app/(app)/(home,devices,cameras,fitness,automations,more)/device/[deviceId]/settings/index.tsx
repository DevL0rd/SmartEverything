import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { DeviceSettingsScreen } from '../../../../../../src/features/devices';

export default function DeviceSettingsScreenRoute(): ReactNode {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  return <DeviceSettingsScreen key={deviceId} deviceId={deviceId} />;
}
