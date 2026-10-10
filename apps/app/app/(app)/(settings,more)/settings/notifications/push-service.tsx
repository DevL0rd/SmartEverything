import type { ReactNode } from 'react';
import { SettingsPageScreen } from '../../../../../src/settings/settings-screen';

export default function PushServiceRoute(): ReactNode {
  return <SettingsPageScreen page="notifications/push-service" />;
}
