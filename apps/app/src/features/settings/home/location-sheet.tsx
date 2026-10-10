import { placeLabel, type PlaceMatch } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { MIN_PLACE_QUERY, placeAt, usePlaceSearch } from '../../../api/places';
import { updateHome } from '../../../api/settings';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { errorText } from '../../../format/errors';
import { joinParts } from '../../../format/text';
import { zoneLabel } from '../../../format/time';
import {
  LocationDeniedError,
  LocationMissingError,
  canLocateHere,
  locateHere,
} from '../../../platform/location';
import { useSettings } from '../../../store/selectors';

const TYPING_MS = 300;

type Step = { readonly kind: 'search' } | { readonly kind: 'zone'; readonly zone: string };

function placeDetail(place: PlaceMatch): string {
  return joinParts([place.region === place.name ? null : place.region, place.country]);
}

function PlaceList({
  places,
  onPick,
}: {
  readonly places: readonly PlaceMatch[];
  readonly onPick: (place: PlaceMatch) => void;
}): ReactNode {
  return (
    <List inset>
      {places.map((place) => (
        <ListRow
          key={`${String(place.latitude)},${String(place.longitude)}`}
          title={place.name}
          subtitle={placeDetail(place)}
          icon="mapPin"
          onPress={() => {
            onPick(place);
          }}
        />
      ))}
    </List>
  );
}

function Results({
  query,
  onPick,
}: {
  readonly query: string;
  readonly onPick: (place: PlaceMatch) => void;
}): ReactNode {
  const settled = useDebouncedValue(query.trim(), TYPING_MS);
  const search = usePlaceSearch(settled);
  if (settled.length < MIN_PLACE_QUERY) {
    return (
      <Text variant="footnote" tone="variant" align="center">
        Type a town or city.
      </Text>
    );
  }
  if (search.isPending) {
    return (
      <View className="gap-2">
        <Skeleton shape="line" />
        <Skeleton shape="line" />
        <Skeleton shape="line" />
      </View>
    );
  }
  if (search.isError) {
    const text = errorText(search.error);
    return <Banner tone="critical" title={text.title} body={text.detail} />;
  }
  if (search.data.length === 0) {
    return (
      <Text variant="footnote" tone="variant" align="center">
        {`Nothing matches “${settled}”.`}
      </Text>
    );
  }
  return <PlaceList places={search.data} onPick={onPick} />;
}

function deniedBanner(error: LocationDeniedError): ReactNode {
  return (
    <Banner
      tone="warning"
      title="Location is off for this app"
      body="Allow it in Android settings, or search instead."
      {...(error.canAskAgain
        ? {}
        : {
            action: {
              label: 'Open settings',
              onPress: (): void => {
                void Linking.openSettings();
              },
            },
          })}
    />
  );
}

function CurrentLocation({ onPick }: { readonly onPick: (place: PlaceMatch) => void }): ReactNode {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState<LocationDeniedError | null>(null);
  const locate = (): void => {
    setBusy(true);
    setDenied(null);
    locateHere()
      .then(placeAt)
      .then(onPick, (error: unknown) => {
        if (error instanceof LocationDeniedError) {
          setDenied(error);
          return;
        }
        if (error instanceof LocationMissingError) {
          notify({ message: error.message });
          return;
        }
        notify({ message: 'Your location couldn’t be found', error, tone: 'critical' });
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <View className="gap-3">
      <Button
        label="Use my current location"
        icon="locate"
        size="lg"
        loading={busy}
        onPress={locate}
      />
      {denied === null ? null : deniedBanner(denied)}
    </View>
  );
}

function ZoneStep({
  zone,
  current,
  onDone,
}: {
  readonly zone: string;
  readonly current: string;
  readonly onDone: () => void;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <View className="gap-4">
      <Text variant="title-3">Also set the time zone?</Text>
      <Text variant="body" tone="variant">
        {`This place uses ${zoneLabel(zone)}. Your home is set to ${zoneLabel(current)}.`}
      </Text>
      <View className="gap-2">
        <Button
          label={`Use ${zoneLabel(zone)}`}
          icon="clock"
          loading={busy}
          onPress={() => {
            setBusy(true);
            updateHome({ time_zone: zone }).then(onDone, (error: unknown) => {
              setBusy(false);
              notify({ message: 'The time zone was not changed', error, tone: 'critical' });
            });
          }}
        />
        <Button label={`Keep ${zoneLabel(current)}`} variant="text" onPress={onDone} />
      </View>
    </View>
  );
}

function usePick(onClose: () => void): {
  readonly step: Step;
  readonly pick: (place: PlaceMatch) => void;
} {
  const zone = useSettings().time_zone;
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const pick = (place: PlaceMatch): void => {
    const label = placeLabel(place);
    updateHome({ latitude: place.latitude, longitude: place.longitude, location_name: label }).then(
      () => {
        notify({ message: `Home set to ${label}`, tone: 'positive' });
        if (place.timeZone !== null && place.timeZone !== zone) {
          setStep({ kind: 'zone', zone: place.timeZone });
          return;
        }
        onClose();
      },
      (error: unknown) => {
        notify({ message: 'The location was not saved', error, tone: 'critical' });
      },
    );
  };
  return { step, pick };
}

export function LocationSheet({ onClose }: { readonly onClose: () => void }): ReactNode {
  const current = useSettings().time_zone;
  const [query, setQuery] = useState('');
  const { step, pick } = usePick(onClose);
  return (
    <Sheet open onClose={onClose} title="Set location" detents={['full']}>
      {step.kind === 'zone' ? (
        <ZoneStep zone={step.zone} current={current} onDone={onClose} />
      ) : (
        <View className="gap-4">
          {canLocateHere() ? <CurrentLocation onPick={pick} /> : null}
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search for a town or city"
            variant="field"
            focusOnMount={!canLocateHere()}
          />
          <Results query={query} onPick={pick} />
          <Text variant="caption" tone="faint" align="center">
            Places from Open-Meteo and OpenStreetMap
          </Text>
        </View>
      )}
    </Sheet>
  );
}
