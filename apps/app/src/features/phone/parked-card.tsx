import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { parkedSpot, type ParkedSpot } from '../../../modules/health-connect';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Text } from '../../components/text';
import { rawErrorText } from '../../format/errors';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';

type Parked =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly spot: ParkedSpot | null }
  | { readonly kind: 'failed'; readonly reason: string };

function useParkedSpot(): Parked {
  const [parked, setParked] = useState<Parked>({ kind: 'loading' });
  useEffect(() => {
    const load = (): void => {
      parkedSpot().then(
        (spot) => {
          setParked({ kind: 'ready', spot });
        },
        (error: unknown) => {
          setParked({ kind: 'failed', reason: rawErrorText(error) });
        },
      );
    };
    load();
    const back = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        load();
      }
    });
    return (): void => {
      back.remove();
    };
  }, []);
  return parked;
}

function mapLink(spot: ParkedSpot): string {
  const at = `${String(spot.latitude)},${String(spot.longitude)}`;
  return `geo:${at}?q=${at}(${encodeURIComponent('Parked car')})`;
}

export function ParkedCard(): ReactNode {
  const parked = useParkedSpot();
  const now = useMinute();
  if (parked.kind === 'failed') {
    return <Banner tone="critical" title="Where you parked can’t be read" body={parked.reason} />;
  }
  if (parked.kind === 'loading' || parked.spot === null) {
    return null;
  }
  const { spot } = parked;
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
          onPress={() => void Linking.openURL(mapLink(spot))}
        />
      </View>
    </Card>
  );
}
