import type { ReactNode } from 'react';
import type { Device } from '../../../store/state';
import { usePhoneView } from '../components/use-phone-view';
import { ThisPhoneRows } from '../this-phone-rows';
import { RemoteSetup } from './remote-setup';

export function PhoneSetup({ device }: { readonly device: Device }): ReactNode {
  const view = usePhoneView(device);
  return view.here ? <ThisPhoneRows pageLink={false} /> : <RemoteSetup device={device} />;
}
