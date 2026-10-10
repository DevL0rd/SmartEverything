import type { ReactNode } from 'react';
import { EmptyState } from '../../components/empty-state';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import { CameraSettingsScreen } from '../cameras';
import { DeviceDiagnosticsScreen, DeviceRemotesScreen } from '../devices';

const PAGES: Readonly<Record<string, (props: { readonly deviceId: string }) => ReactNode>> = {
  remotes: DeviceRemotesScreen,
  diagnostics: DeviceDiagnosticsScreen,
  camera: CameraSettingsScreen,
};

export function DeviceSettingsPage({
  deviceId,
  page,
}: {
  readonly deviceId: string;
  readonly page: string;
}): ReactNode {
  const Page = PAGES[page];
  if (Page === undefined) {
    return (
      <Screen header={<PageHeader title="Settings" />} maxWidth="reading">
        <EmptyState
          icon="settings"
          title="Page not found"
          body="This settings page does not exist."
        />
      </Screen>
    );
  }
  return <Page deviceId={deviceId} />;
}
