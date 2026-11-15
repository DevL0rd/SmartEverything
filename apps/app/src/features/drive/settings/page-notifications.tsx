import type { ReactNode } from 'react';
import { PushKindsSetting } from '../notifications/push-kinds';
import { DriveSettingsSection } from './page';

export function NotificationsSection(): ReactNode {
  return (
    <DriveSettingsSection section="notifications">
      <PushKindsSetting />
    </DriveSettingsSection>
  );
}
