import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useComfortReadings } from '../data/use-readings';
import type { ComfortMetric } from '../model/comfort';
import { ReadingsRow } from './readings-row';

const STRIP_METRICS: readonly ComfortMetric[] = ['temperature', 'humidity', 'pm25'];

export function ComfortStrip({ room }: { readonly room: string | null }): ReactNode {
  const readings = useComfortReadings(STRIP_METRICS, room);
  if (readings.length === 0) {
    return null;
  }
  return (
    <View
      accessibilityLabel="Indoor comfort"
      className="rounded-lg border-hairline border-outline-variant bg-surface-1 p-card-pad"
    >
      <ReadingsRow readings={readings} />
    </View>
  );
}
