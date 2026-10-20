import type { BottleSettingsView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../../components/loaded-query';
import { DeviceSettingsFrame } from '../../../features/devices/device-settings/settings-frame';
import type { Device } from '../../../store/state';
import { BottleStrip } from '../components/bottle-strip';
import { BindingNotice } from '../components/notice-card';
import { useBottleStatus, useBottleView } from '../data/bottle-data';
import { BottleList } from './bottle-list';
import { CalibrationList } from './calibration-list';
import { DiagnosticsList } from './diagnostics-list';
import { ForgetList } from './forget-row';
import { RemindersList } from './reminders-list';
import { SyncList } from './sync-list';

function Sections({
  view,
  name,
}: {
  readonly view: BottleSettingsView;
  readonly name: string;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <BottleList view={view} />
      <RemindersList view={view} />
      <CalibrationList view={view} />
      <SyncList view={view} />
      {view.mayEdit ? <DiagnosticsList deviceId={view.deviceId} /> : null}
      {view.mayEdit ? <ForgetList deviceId={view.deviceId} name={name} /> : null}
    </View>
  );
}

export function BottleSettingsPage({ device }: { readonly device: Device }): ReactNode {
  const settings = useBottleView(device.id, 'settings');
  const status = useBottleStatus(device.id).data;
  return (
    <DeviceSettingsFrame deviceId={device.id} name={device.label} title="Water bottle">
      <View className="gap-section-gap">
        <BottleStrip device={device} />
        {status === undefined ? null : <BindingNotice view={status} />}
        <LoadedQuery query={settings}>
          {(view) => <Sections view={view} name={device.label} />}
        </LoadedQuery>
      </View>
    </DeviceSettingsFrame>
  );
}
