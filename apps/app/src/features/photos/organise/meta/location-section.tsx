import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PlaceMatch } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { MIN_PLACE_QUERY, placeAt, usePlaceSearch } from '../../../../api/places';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { ListRow } from '../../../../components/list-row';
import { SearchField } from '../../../../components/search-field';
import { List } from '../../../../components/section';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import { useDebouncedValue } from '../../../../design/use-debounced-value';
import { WORLD_START, type MapView } from '../../places/map-view';
import type { GeoPoint } from '../../world-map/projection';
import type { LocationDraft } from './meta-model';
import type { MetaCurrent } from './meta-request';
import { coordinateText, locationOfMatch, PICK_ZOOM, placeName, viewOn } from './pick-model';
import { PinMap } from './pin-map';

const TYPING_MS = 300;

export interface LocationSectionProps {
  readonly current: MetaCurrent | null;
  readonly draft: LocationDraft;
  readonly onDraft: (draft: LocationDraft) => void;
  readonly onZone: (timeZone: string) => void;
}

function Matches({
  query,
  onPick,
}: {
  readonly query: string;
  readonly onPick: (place: PlaceMatch) => void;
}): ReactNode {
  const settled = useDebouncedValue(query.trim(), TYPING_MS);
  const search = usePlaceSearch(settled);
  if (settled.length < MIN_PLACE_QUERY) return null;
  if (search.isPending) return <Skeleton shape="block" className="h-24" />;
  if (search.isError) {
    return (
      <Text variant="footnote" tone="critical">
        Place search is not answering. Tap the map instead.
      </Text>
    );
  }
  if (search.data.length === 0) {
    return (
      <Text variant="footnote" tone="variant">
        No town or city by that name. Tap the map instead.
      </Text>
    );
  }
  return (
    <List inset>
      {search.data.map((place) => (
        <ListRow
          key={`${String(place.latitude)},${String(place.longitude)}`}
          title={place.name}
          subtitle={placeName(place)}
          icon="mapPin"
          onPress={() => {
            onPick(place);
          }}
        />
      ))}
    </List>
  );
}

function shownPin(props: LocationSectionProps): GeoPoint | null {
  if (props.draft.kind === 'set') {
    return { lat: props.draft.place.latitude, lon: props.draft.place.longitude };
  }
  if (props.draft.kind === 'clear') return null;
  return props.current?.place ?? null;
}

function chosenLine(props: LocationSectionProps, pin: GeoPoint | null): string {
  if (props.draft.kind === 'clear') return 'Location will be removed';
  if (props.draft.kind === 'set') {
    const { place } = props.draft;
    return place.label ?? coordinateText({ lat: place.latitude, lon: place.longitude });
  }
  if (pin === null) return 'No location yet';
  return props.current?.placeLabel ?? coordinateText(pin);
}

function Chosen({
  section,
  pin,
}: {
  readonly section: LocationSectionProps;
  readonly pin: GeoPoint | null;
}): ReactNode {
  const removable = section.draft.kind !== 'clear' && pin !== null;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Icon name={section.draft.kind === 'clear' ? 'locoff' : 'mapPin'} size={20} tone="variant" />
      <Text variant="callout" numberOfLines={2} className="min-w-0 flex-1">
        {chosenLine(section, pin)}
      </Text>
      {section.draft.kind === 'keep' ? null : (
        <Button
          label="Undo"
          variant="text"
          onPress={() => {
            section.onDraft({ kind: 'keep' });
          }}
        />
      )}
      {removable ? (
        <Button
          label="Remove location"
          icon="locoff"
          variant="outlined"
          onPress={() => {
            section.onDraft({ kind: 'clear' });
          }}
        />
      ) : null}
    </View>
  );
}

interface PickCounter {
  readonly next: () => number;
  readonly latest: (pick: number) => boolean;
}

function usePickCounter(): PickCounter {
  const counter = useRef(0);
  return {
    next: (): number => {
      counter.current += 1;
      return counter.current;
    },
    latest: (pick): boolean => pick === counter.current,
  };
}

function pickerOf(props: LocationSectionProps, picks: PickCounter): (point: GeoPoint) => void {
  return (point) => {
    const pick = picks.next();
    props.onDraft({
      kind: 'set',
      place: { latitude: point.lat, longitude: point.lon, label: null },
    });
    background(
      placeAt({ latitude: point.lat, longitude: point.lon }).then((place) => {
        if (!picks.latest(pick)) return;
        props.onDraft({
          kind: 'set',
          place: { latitude: point.lat, longitude: point.lon, label: placeName(place) },
        });
        if (place.timeZone !== null) props.onZone(place.timeZone);
      }),
      'photos.organise.place_lookup_failed',
    );
  };
}

export function LocationSection(props: LocationSectionProps): ReactNode {
  const [query, setQuery] = useState('');
  const start = props.current?.place ?? null;
  const [view, setView] = useState<MapView>(
    start === null ? WORLD_START : viewOn(start, PICK_ZOOM),
  );
  const pin = shownPin(props);
  const picks = usePickCounter();
  const pickPoint = pickerOf(props, picks);
  return (
    <View className="gap-3">
      <Chosen section={props} pin={pin} />
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search for a town or city"
        icon="search"
        variant="field"
      />
      <Matches
        query={query}
        onPick={(place) => {
          picks.next();
          setQuery('');
          setView(viewOn({ lat: place.latitude, lon: place.longitude }, PICK_ZOOM));
          props.onDraft({ kind: 'set', place: locationOfMatch(place) });
          if (place.timeZone !== null) props.onZone(place.timeZone);
        }}
      />
      <PinMap view={view} onView={setView} pin={pin} onPick={pickPoint} />
    </View>
  );
}
