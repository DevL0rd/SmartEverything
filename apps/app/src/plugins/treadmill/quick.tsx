import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../components/loaded-query';
import type { Device } from '../../store/state';
import { BeltControls } from './components/belt-controls';
import { useTreadmillDemand, useTreadmillState } from './data/treadmill-data';

export function TreadmillQuick({ device }: { readonly device: Device }): ReactNode {
  const state = useTreadmillState(device.id);
  useTreadmillDemand(device.id);
  return (
    <LoadedQuery query={state}>
      {(view) => (
        <View className="gap-4">
          <BeltControls deviceId={device.id} view={view} />
        </View>
      )}
    </LoadedQuery>
  );
}
