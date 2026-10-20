import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../../components/loaded-query';
import { DeviceSettingsFrame } from '../../../features/devices/device-settings/settings-frame';
import type { Device } from '../../../store/state';
import { BeltStrip } from '../components/belt-strip';
import { useTreadmillState, useTreadmillView } from '../data/treadmill-data';
import { BeltList } from './belt-list';
import { CaloriesList } from './calories-list';
import { CareList } from './care-list';
import { DiagnosticsList } from './diagnostics-list';
import { GoalsList } from './goals-list';
import { InclineList } from './incline-list';
import { LinkList } from './link-list';
import { SafetyList } from './safety-list';
import type { SettingsProps } from './settings-props';

function OwnerSections(props: SettingsProps): ReactNode {
  return (
    <>
      <SafetyList {...props} />
      <InclineList {...props} />
      <BeltList {...props} />
      <CaloriesList {...props} />
      <CareList {...props} />
      <DiagnosticsList {...props} />
    </>
  );
}

function Sections({
  device,
  state,
}: {
  readonly device: Device;
  readonly state: TreadmillStateView;
}): ReactNode {
  const settings = useTreadmillView(device.id, 'settings');
  return (
    <LoadedQuery query={settings}>
      {(loaded) => {
        const props: SettingsProps = { deviceId: device.id, state, settings: loaded };
        return (
          <View className="gap-section-gap">
            <LinkList {...props} />
            <GoalsList {...props} />
            {state.mayConfigure ? <OwnerSections {...props} /> : null}
          </View>
        );
      }}
    </LoadedQuery>
  );
}

export function TreadmillSettingsPage({ device }: { readonly device: Device }): ReactNode {
  const state = useTreadmillState(device.id);
  return (
    <DeviceSettingsFrame deviceId={device.id} name={device.label} title="Treadmill">
      <View className="gap-section-gap">
        <BeltStrip device={device} />
        <LoadedQuery query={state}>
          {(view) => <Sections device={device} state={view} />}
        </LoadedQuery>
      </View>
    </DeviceSettingsFrame>
  );
}
