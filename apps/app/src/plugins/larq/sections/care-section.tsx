import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../../components/loaded-query';
import type { Device } from '../../../store/state';
import { BatteryCard } from '../components/battery-card';
import { BottleStrip } from '../components/bottle-strip';
import { FaultsCard } from '../components/faults-card';
import { FilterCard } from '../components/filter-card';
import { UvCard } from '../components/uv-card';
import { useBottleView } from '../data/bottle-data';

export function CareSection({ device }: { readonly device: Device }): ReactNode {
  const care = useBottleView(device.id, 'care');
  return (
    <View className="gap-section-gap">
      <BottleStrip device={device} />
      <LoadedQuery query={care}>
        {(view) => (
          <View className="gap-section-gap">
            <FaultsCard faults={view.faults} />
            <UvCard care={view} />
            <BatteryCard battery={view.battery} />
            <FilterCard filter={view.filter} deviceId={device.id} />
          </View>
        )}
      </LoadedQuery>
    </View>
  );
}
