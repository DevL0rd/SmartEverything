import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { DeviceScreen } from '../../../../../src/features/devices';

export default function DevicePluginSectionRoute(): ReactNode {
  const { deviceId, section } = useLocalSearchParams<{ deviceId: string; section: string }>();
  return <DeviceScreen key={deviceId} deviceId={deviceId} section={section} />;
}
