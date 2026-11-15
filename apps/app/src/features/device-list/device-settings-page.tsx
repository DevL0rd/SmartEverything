import { pluginDevicePage } from '../../app-shell/device-pages';
import { useDevice } from '../../store/selectors';
import type { ReactNode } from 'react';
import { EmptyState } from '../../components/empty-state';
import { PageShell } from '../../components/page-shell/page-shell';
import {
  ComputerClaudeScreen,
  ComputerProviderScreen,
  ComputerCodexScreen,
  ComputerCodexProviderScreen,
  COMPUTER_SCREENS,
} from '../computers';
import { CameraSettingsScreen } from '../cameras';
import {
  ADD_APPLIANCE_PAGE,
  AddApplianceScreen,
  DeviceDiagnosticsScreen,
  DeviceRemotesScreen,
  ModelSettingsScreen,
} from '../devices';
import { MODEL_PAGE } from '../models';
import { PHONE_SCREENS } from '../phone';

type DeviceScreenOf = (props: { readonly deviceId: string }) => ReactNode;

const PAGES: Readonly<Record<string, DeviceScreenOf>> = {
  claude: ComputerClaudeScreen,
  codex: ComputerCodexScreen,
  'codex-provider': ComputerCodexProviderScreen,
  'claude-provider': ComputerProviderScreen,
  remotes: DeviceRemotesScreen,
  [ADD_APPLIANCE_PAGE]: AddApplianceScreen,
  diagnostics: DeviceDiagnosticsScreen,
  camera: CameraSettingsScreen,
  [MODEL_PAGE]: ModelSettingsScreen,
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
      <PageShell title="Settings" width="reading">
        <EmptyState
          icon="settings"
          title="Page not found"
          body="This settings page does not exist."
        />
      </PageShell>
    );
  }
  return <Page deviceId={deviceId} />;
}
