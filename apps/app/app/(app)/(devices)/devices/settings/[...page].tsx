import type { ReactNode } from 'react';
import { MountedSettingsRoute } from '../../../../../src/settings/settings-screen';

export default function SettingsPageRoute(): ReactNode {
  return <MountedSettingsRoute root="devices" />;
}
