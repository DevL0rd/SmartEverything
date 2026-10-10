import type { ReactNode } from 'react';
import { SettingsPageScreen } from '../../../../../src/settings/settings-screen';

export default function HomeSettingsRoute(): ReactNode {
  return <SettingsPageScreen page="home" />;
}
