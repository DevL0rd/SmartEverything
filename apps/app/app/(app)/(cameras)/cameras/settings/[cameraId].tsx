import type { ReactNode } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OldCameraSettingsRoute(): ReactNode {
  const { cameraId } = useLocalSearchParams<{ cameraId: string }>();
  return (
    <Redirect
      href={{
        pathname: '/device/[deviceId]/settings/[page]',
        params: { deviceId: cameraId, page: 'camera' },
      }}
    />
  );
}
