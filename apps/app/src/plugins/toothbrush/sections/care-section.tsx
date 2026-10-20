import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LoadedQuery } from '../../../components/loaded-query';
import type { Device } from '../../../store/state';
import { brandUi } from '../brands';
import { BatteryCard, HeadCard as SharedHeadCard } from '../components/care-cards';
import { useBrushState } from '../data/brush-data';

export function CareSection({ device }: { readonly device: Device }): ReactNode {
  const state = useBrushState(device.id);
  return (
    <LoadedQuery query={state}>
      {(view) => {
        const { CareCards, HeadCard } = brandUi(view.profile.brand);
        return (
          <View className="gap-section-gap">
            {HeadCard === null ? (
              view.profile.head === 'none' ? null : (
                <SharedHeadCard deviceId={device.id} view={view} />
              )
            ) : (
              <HeadCard deviceId={device.id} view={view} />
            )}
            <BatteryCard deviceId={device.id} />
            {CareCards === null ? null : <CareCards deviceId={device.id} view={view} />}
          </View>
        );
      }}
    </LoadedQuery>
  );
}
