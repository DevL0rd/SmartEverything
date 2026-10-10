import type { ReactNode } from 'react';
import { SettingsPageScreen } from '../../../../../src/settings/settings-screen';

export default function DevicesSettingsRoute(): ReactNode {
  return <SettingsPageScreen page="devices" />;
}
