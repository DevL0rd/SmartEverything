import { APP_PLUGINS } from '../../plugins/registry';
import { useDevice } from '../../store/selectors';
import type { ReactNode } from 'react';
import { EmptyState } from '../../components/empty-state';
import { PageHeader } from '../../components/page-header';
import { Screen } from '../../components/screen';
import {
  ComputerClaudeScreen,
  ComputerSessionsScreen,
  ComputerProviderScreen,
  ComputerCodexScreen,
  ComputerCodexSessionsScreen,
  ComputerCodexProviderScreen,
} from '../computers';
import { CameraSettingsScreen } from '../cameras';
import { DeviceDiagnosticsScreen, DeviceRemotesScreen } from '../devices';

const PAGES: Readonly<Record<string, (props: { readonly deviceId: string }) => ReactNode>> = {
  claude: ComputerClaudeScreen,
  codex: ComputerCodexScreen,
  'codex-sessions': ComputerCodexSessionsScreen,
  'codex-provider': ComputerCodexProviderScreen,
  'claude-sessions': ComputerSessionsScreen,
  'claude-provider': ComputerProviderScreen,
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
  const device = useDevice(deviceId);
  const contribution =
    device === null
      ? undefined
      : APP_PLUGINS.flatMap((plugin) => plugin.deviceSettingsPages ?? []).find(
          (item) => item.id === page && item.applies(device),
        );
  if (contribution !== undefined && device !== null) return contribution.render(device);
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
