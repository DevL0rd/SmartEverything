import type { ReactNode } from 'react';
import { MountedSettingsRoute } from '../../../../../src/settings/settings-screen';

export default function SettingsRoute(): ReactNode {
  return <MountedSettingsRoute root="cameras/remote-viewing" />;
}
