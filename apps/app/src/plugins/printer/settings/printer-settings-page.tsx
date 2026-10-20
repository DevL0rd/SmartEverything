import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../../components/loaded-query';
import { DeviceSettingsFrame } from '../../../features/devices/device-settings/settings-frame';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePrinterActor, usePrinterView } from '../data/use-printer-view';
import { GoalsList, NotificationsList, UpdatesList } from './budget-list';
import { ConnectionList } from './connection-list';
import { DataList, DefaultsList } from './defaults-list';
import { SuppliesList } from './supplies-list';

export function PrinterSettingsPage({ device }: { readonly device: Device }): ReactNode {
  const owner = useIsOwner();
  const actor = usePrinterActor(device);
  const settings = usePrinterView(device, 'settings');
  return (
    <DeviceSettingsFrame deviceId={device.id} name={device.label} title="Printer">
      <LoadedQuery query={settings}>
        {(loaded) => {
          const props = { device, settings: loaded, actor, owner };
          return (
            <View className="gap-section-gap">
              <ConnectionList {...props} />
              <UpdatesList {...props} />
              <SuppliesList {...props} />
              <GoalsList {...props} />
              <DefaultsList {...props} />
              <NotificationsList {...props} />
              <DataList {...props} />
            </View>
          );
        }}
      </LoadedQuery>
    </DeviceSettingsFrame>
  );
}
