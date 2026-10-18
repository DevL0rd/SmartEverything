import type { ReactNode } from 'react';
import { PhonePage } from '../frame/phone-page';
import { PhoneSetup } from '../setup/phone-setup';

export function PhoneSetupScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <PhonePage deviceId={deviceId} title="Setup" width="detail">
      {(device) => <PhoneSetup device={device} />}
    </PhonePage>
  );
}
