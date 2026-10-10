import type { ReactNode } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { SettingsPageScreen } from '../../../../../src/settings/settings-screen';
import { settingsPage } from '../../../../../src/settings/tree';

export default function CameraSettingsPageRoute(): ReactNode {
  const { cameraId } = useLocalSearchParams<{ cameraId: string }>();
  const page = `cameras/${cameraId}`;
  if (settingsPage(page) !== undefined) {
    return <SettingsPageScreen page={page} />;
  }
  return (
    <Redirect
      href={{
        pathname: '/device/[deviceId]/settings/[page]',
        params: { deviceId: cameraId, page: 'camera' },
      }}
    />
  );
}
