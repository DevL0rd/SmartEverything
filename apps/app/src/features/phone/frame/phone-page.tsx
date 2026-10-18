import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { href } from '../../../app-shell/hrefs';
import type { FrameWidth } from '../../../components/section-body';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { PhoneFrame } from './phone-frame';

export function PhonePage({
  deviceId,
  title,
  width,
  root = false,
  children,
}: {
  readonly deviceId: string;
  readonly title: string | null;
  readonly width: FrameWidth;
  readonly root?: boolean;
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
      width={width}
      {...(root
        ? { crumbs: [{ label: 'Devices', href: href.devices() }, { label: device.label }] }
        : {})}
    >
      {children(device)}
    </PhoneFrame>
  );
}
