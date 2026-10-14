import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useDevice } from '../../../store/selectors';

export function ComputerFrame({
  deviceId,
  title,
  children,
}: {
  readonly deviceId: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  const device = useDevice(deviceId);
  return (
    <Screen
      maxWidth="reading"
      header={
        <PageHeader
          title={title}
          subtitle={device?.label ?? 'Computer unavailable'}
          breadcrumbs={[
            { label: 'Devices', href: href.devices() },
            { label: device?.label ?? 'Computer', href: href.settings.device(deviceId) },
          ]}
        />
      }
    >
      {children}
    </Screen>
  );
}
