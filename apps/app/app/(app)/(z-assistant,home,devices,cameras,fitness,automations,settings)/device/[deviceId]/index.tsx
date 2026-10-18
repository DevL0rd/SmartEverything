import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ComputerOverviewScreen } from '../../../../../src/features/computers';
import { DeviceScreen } from '../../../../../src/features/devices';
import { PhoneOverviewScreen } from '../../../../../src/features/phone';
import { useDevice } from '../../../../../src/store/selectors';

export default function DeviceOverviewRoute(): ReactNode {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const device = useDevice(deviceId);
  if (device?.kind === 'computer')
    return <ComputerOverviewScreen key={deviceId} deviceId={deviceId} />;
  if (device?.kind === 'phone') return <PhoneOverviewScreen key={deviceId} deviceId={deviceId} />;
  return <DeviceScreen key={deviceId} deviceId={deviceId} section="overview" />;
}
