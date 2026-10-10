import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { DeviceScreen } from '../../../../../src/features/devices';

export default function DeviceActivityRoute(): ReactNode {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  return <DeviceScreen key={deviceId} deviceId={deviceId} section="activity" />;
}
