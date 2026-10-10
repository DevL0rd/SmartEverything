import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { DeviceSettingsPage } from '../../../../../../src/features/device-list';

export default function DeviceSettingsPageRoute(): ReactNode {
  const { deviceId, page } = useLocalSearchParams<{ deviceId: string; page: string }>();
  return <DeviceSettingsPage key={deviceId} deviceId={deviceId} page={page} />;
}
