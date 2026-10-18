import type { ReactNode } from 'react';
import { PhonePage } from '../frame/phone-page';
import { PhoneApps } from '../apps/phone-apps';

export function PhoneAppsScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <PhonePage deviceId={deviceId} title="Apps" width="detail">
      {(device) => <PhoneApps device={device} />}
    </PhonePage>
  );
}
