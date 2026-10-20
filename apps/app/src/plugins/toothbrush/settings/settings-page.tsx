import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../../components/loaded-query';
import { DeviceSettingsFrame } from '../../../features/devices/device-settings/settings-frame';
import type { Device } from '../../../store/state';
import { brandUi } from '../brands';
import { useBrushState, useBrushView } from '../data/brush-data';
import { AlertsList } from './alerts-list';
import { DiagnosticsList } from './diagnostics-list';
import { GoalsList } from './goals-list';
import { LinkList } from './link-list';
import { PersonList } from './person-list';
import type { SettingsProps } from './settings-props';

function Sections({
  device,
  state,
}: {
  readonly device: Device;
  readonly state: BrushStateView;
}): ReactNode {
  const settings = useBrushView(device.id, 'settings');
  return (
    <LoadedQuery query={settings}>
      {(loaded) => {
        const props: SettingsProps = { deviceId: device.id, state, settings: loaded };
        const { HandleSettings } = brandUi(state.profile.brand);
        return (
          <View className="gap-section-gap">
            <LinkList {...props} />
            <PersonList {...props} />
            <GoalsList {...props} />
            <AlertsList {...props} />
            {HandleSettings === null ? null : <HandleSettings {...props} />}
            <DiagnosticsList {...props} />
          </View>
        );
      }}
    </LoadedQuery>
  );
}

export function BrushSettingsPage({ device }: { readonly device: Device }): ReactNode {
  const state = useBrushState(device.id);
  return (
    <DeviceSettingsFrame deviceId={device.id} name={device.label} title="Toothbrush">
      <LoadedQuery query={state}>{(view) => <Sections device={device} state={view} />}</LoadedQuery>
    </DeviceSettingsFrame>
  );
}
