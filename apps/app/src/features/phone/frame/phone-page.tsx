import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { href } from '../../../app-shell/hrefs';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { PhoneFrame } from './phone-frame';

export function PhonePage({
  deviceId,
  title,
  root = false,
  search,
  children,
}: {
  readonly deviceId: string;
  readonly title: string | null;
  readonly root?: boolean;
  readonly search?: ShellSearchConfig;
  readonly children: (device: Device) => ReactNode;
}): ReactNode {
  const device = useDevice(deviceId);
  if (device?.kind !== 'phone') {
    return (
      <PhoneFrame deviceId={deviceId} title={title ?? 'Phone'}>
        <EmptyState
          icon="smartphone"
          title="Phone unavailable"
          body="This phone isn’t shared with your home any more."
        />
      </PhoneFrame>
    );
  }
  return (
    <PhoneFrame
      deviceId={device.id}
      title={title ?? device.label}
      {...(search === undefined ? {} : { search })}
      {...(root
        ? { crumbs: [{ label: 'Devices', href: href.devices() }, { label: device.label }] }
        : {})}
    >
      {children(device)}
    </PhoneFrame>
  );
}
