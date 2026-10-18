import type { ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { parkedSpot, type ParkedSpot } from '../../../../modules/health-connect';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { rawErrorText } from '../../../format/errors';
import { relative } from '../../../format/time';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useMinute } from '../../../store/clock';
import { background } from '@smarteverything/logging';

const PARKED_SPOT_KEY = ['native', 'parked-spot'] as const;

function useParkedSpot(): {
  readonly spot: ParkedSpot | null | undefined;
  readonly error: Error | null;
} {
  const query = useScreenQuery({
    queryKey: PARKED_SPOT_KEY,
    queryFn: parkedSpot,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return { spot: query.data, error: query.error };
}

function mapLink(spot: ParkedSpot): string {
  const at = `${String(spot.latitude)},${String(spot.longitude)}`;
  return `geo:${at}?q=${at}(${encodeURIComponent('Parked car')})`;
}

export function ParkedCard({ maxAgeMs }: { readonly maxAgeMs?: number }): ReactNode {
  const { spot, error } = useParkedSpot();
  const now = useMinute();
  if (spot === undefined && error !== null) {
    return (
      <Banner tone="critical" title="Where you parked can’t be read" body={rawErrorText(error)} />
    );
  }
  if (spot === undefined || spot === null) {
    return null;
  }
  if (maxAgeMs !== undefined && now - Date.parse(spot.at) > maxAgeMs) {
    return null;
  }
  return (
    <Card>
      <View className="gap-3">
        <View className="gap-1">
          <Text variant="title-3">
            {spot.place === null ? 'Parked' : `Parked at ${spot.place}`}
          </Text>
          <Text variant="callout" tone="variant">
            {`${relative(spot.at, now)} · only this phone knows where`}
          </Text>
        </View>
        <Button
          label="Show on the map"
          icon="mapPin"
          variant="tonal"
          onPress={() => {
            background(Linking.openURL(mapLink(spot)), 'url.open_failed');
          }}
        />
      </View>
    </Card>
  );
}
