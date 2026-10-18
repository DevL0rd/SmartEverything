import { pluginDevicePage } from '../../app-shell/device-pages';
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
  COMPUTER_SCREENS,
} from '../computers';
import { CameraSettingsScreen } from '../cameras';
import { DeviceDiagnosticsScreen, DeviceRemotesScreen } from '../devices';
import { PHONE_SCREENS } from '../phone';

type DeviceScreenOf = (props: { readonly deviceId: string }) => ReactNode;

const PAGES: Readonly<Record<string, DeviceScreenOf>> = {
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

const KIND_SCREENS: Readonly<Record<string, Readonly<Record<string, DeviceScreenOf>>>> = {
  computer: COMPUTER_SCREENS,
  phone: PHONE_SCREENS,
};

export function DeviceSettingsPage({
  deviceId,
  page,
}: {
  readonly deviceId: string;
  readonly page: string;
}): ReactNode {
  const device = useDevice(deviceId);
  const contribution = device === null ? undefined : pluginDevicePage(device, page);
  if (contribution !== undefined && device !== null) return contribution.render(device);
  const Page = PAGES[page] ?? (device === null ? undefined : KIND_SCREENS[device.kind]?.[page]);
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
