import type { ReactNode } from 'react';
import { PhonePage } from '../frame/phone-page';
import { PhoneNotifications } from '../notifications/phone-notifications';

export function PhoneNotificationsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <PhonePage deviceId={deviceId} title="Notifications" width="detail">
      {(device) => <PhoneNotifications device={device} />}
    </PhonePage>
  );
}
