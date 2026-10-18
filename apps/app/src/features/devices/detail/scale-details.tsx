import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { ScaleStatus } from '../../profiles';
import type { Device } from '../../../store/state';
import { CompositionCard } from '../scale/composition-card';
import { PeopleBlock } from '../scale/people-block';
import { RecentWeighIns } from '../scale/recent-weigh-ins';
import { TrendCard } from '../scale/trend-card';
import { useScale } from '../scale/use-scale';

const NO_SETTINGS = 'The scale has no settings here. Step on it with your phone nearby.';

export function ScaleDetails({ scale: device }: { readonly scale: Device }): ReactNode {
  const scale = useScale(device);
  return (
    <>
      <CompositionCard scale={scale} />
      <TrendCard scale={scale} />
      <RecentWeighIns scale={scale} />
      <PeopleBlock scale={scale} />
      <ScaleStatus scale={device} />
      <Text variant="footnote" tone="variant">
        {NO_SETTINGS}
      </Text>
    </>
  );
}
