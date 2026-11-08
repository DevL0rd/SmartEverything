import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { PlaceCountry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import type { HeaderAction } from '../../../components/page-header';
import { SearchField } from '../../../components/search-field';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { useSyncStatus } from '../../../store/selectors';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoPlaces } from '../data';
import { NATURAL_EARTH_ATTRIBUTION } from '../world-map';
import { ClusterCard } from './cluster-card';
import { ClusterMap } from './cluster-map';
import { MonthRangeCard } from './month-range';
import type { MapBounds } from './map-view';
import { inViewLine, libraryLine, placesIn, sideCountries } from './place-model';
import { PhonePlacesPanel } from './phone-places-panel';
import { CountryList, PlaceCards } from './places-list';
import { useMapState, type MapState } from './use-map-state';

type MapMode = 'map' | 'places';

const MODES: readonly SegmentedOption<MapMode>[] = [
  { value: 'map', label: 'Map', icon: 'mapPin' },
  { value: 'places', label: 'Places', icon: 'list' },
];

export const MAP_COPY = {
  empty: {
    title: 'Photos with a location show up here',
    body: "Turn on location in your phone's camera. Photos without one stay in the Timeline.",
  },
  offline: {
    title: 'The hub is offline',
    body: 'These are the places from your last visit. They update when the hub is back.',
  },
  unreachable: {
    title: 'The hub is offline',
    body: 'Map and places open when the hub reconnects. Your photos stay on the hub as they are.',
  },
  find: 'Find a place',
  inView: 'Places in view',
  found: 'Places found',
  noMatch: 'No place matches. Try a city, region or country.',
  noneInView: 'No places in this part of the map. Zoom out to see more.',
} as const;

const MAP_ACTIONS: readonly HeaderAction[] = [
  {
    icon: 'settings',
    label: 'Map settings',
    iconOnly: true,
    href: href.settings.focus('photos', 'photos.map.enabled'),
  },
];

const WIDE_COLUMNS_FROM = 1200;

type PlacesQuery = ReturnType<typeof usePhotoPlaces>;

const MAP_LABEL = 'World map of where your photos were taken';

function columnsOf(area: number, wide: number): number {
  if (libraryLayoutOf(area) === 'compact') return 1;
  return area >= WIDE_COLUMNS_FROM ? wide : 2;
}

function WorldCard({
  state,
  countries,
  className,
}: {
  readonly state: MapState;
  readonly countries: readonly PlaceCountry[];
  readonly className: string;
}): ReactNode {
  const selected = state.selected;
  return (
    <ClusterMap
      view={state.view}
      onView={state.setView}
      onFrame={state.setFrame}
      clusters={state.clusters}
      selected={selected}
      onSelect={state.select}
      label={MAP_LABEL}
      attribution={NATURAL_EARTH_ATTRIBUTION}
      className={className}
      card={
        selected === null ? null : (
          <ClusterCard
            cluster={selected}
            countries={countries}
            onZoom={() => {
              state.zoomInto(selected);
            }}
            onClose={() => {
              state.select(null);
            }}
          />
        )
      }
    />
  );
}

function countOf(countries: readonly PlaceCountry[]): number {
  return countries.reduce((sum, country) => sum + country.places.length, 0);
}

function SidePlaces({
  countries,
  bounds,
  fill,
}: {
  readonly countries: readonly PlaceCountry[];
  readonly bounds: MapBounds;
  readonly fill: boolean;
}): ReactNode {
  const [text, setText] = useState('');
  const shown = sideCountries(countries, bounds, text);
  const searching = text.trim() !== '';
  const list =
    shown.length === 0 ? (
      <Text variant="footnote" tone="variant" className="px-2.5 py-2">
        {searching ? MAP_COPY.noMatch : MAP_COPY.noneInView}
      </Text>
    ) : (
      <CountryList countries={shown} />
    );
  return (
    <Card
      title={searching ? MAP_COPY.found : MAP_COPY.inView}
      metadata={
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {inViewLine(countOf(shown), countOf(countries))}
        </Text>
      }
      {...(fill ? { className: 'absolute inset-0' } : {})}
    >
      <SearchField value={text} onChange={setText} placeholder={MAP_COPY.find} />
      {fill ? <ScrollView className="-mx-2.5 flex-1">{list}</ScrollView> : list}
    </Card>
  );
}

function WideMap({
  countries,
  area,
}: {
  readonly countries: readonly PlaceCountry[];
  readonly area: number;
}): ReactNode {
  const state = useMapState(true);
  const side = area >= WIDE_COLUMNS_FROM;
  return (
    <View className={side ? 'flex-row gap-section-gap' : 'gap-section-gap'}>
      <View className="min-w-0 flex-1 gap-section-gap">
        <WorldCard
          state={state}
          countries={countries}
          className="h-115 rounded-lg border-hairline border-outline-variant"
        />
        {state.months.length === 0 ? null : (
          <MonthRangeCard months={state.months} range={state.range} onRange={state.setRange} />
        )}
      </View>
      {side ? (
        <View className="w-80">
          <SidePlaces countries={countries} bounds={state.bounds} fill />
        </View>
      ) : (
        <SidePlaces countries={countries} bounds={state.bounds} fill={false} />
      )}
    </View>
  );
}

function PhoneMap({ countries }: { readonly countries: readonly PlaceCountry[] }): ReactNode {
  const state = useMapState(true);
  return (
    <View className="min-h-0 flex-1">
      <WorldCard state={state} countries={countries} className="flex-1" />
      <PhonePlacesPanel places={placesIn(countries, state.bounds)} total={countOf(countries)} />
    </View>
  );
}

function Body({
  mode,
  countries,
}: {
  readonly mode: MapMode;
  readonly countries: readonly PlaceCountry[];
}): ReactNode {
  const area = useAreaWidth();
  if (countries.length === 0) {
    return <EmptyState icon="mapPin" title={MAP_COPY.empty.title} body={MAP_COPY.empty.body} />;
  }
  if (mode === 'places') return <PlaceCards countries={countries} columns={columnsOf(area, 3)} />;
  if (libraryLayoutOf(area) === 'compact') return <PhoneMap countries={countries} />;
  return <WideMap countries={countries} area={area} />;
}

function Loading({ places }: { readonly places: PlacesQuery }): ReactNode {
  const live = useSyncStatus().status === 'live';
  if (!places.isError) return <Skeleton shape="block" className="h-115 w-full" />;
  if (!live) {
    return (
      <EmptyState
        icon="wifiOff"
        title={MAP_COPY.unreachable.title}
        body={MAP_COPY.unreachable.body}
      />
    );
  }
  return (
    <ErrorState
      error={places.error}
      page
      retry={() => {
        background(places.refetch(), 'places.refetch_failed');
      }}
    />
  );
}

function OfflineNote(): ReactNode {
  const offline = useSyncStatus().status === 'interrupted';
  return offline ? (
    <Banner tone="warning" title={MAP_COPY.offline.title} body={MAP_COPY.offline.body} wrapBody />
  ) : null;
}

export function MapScreen(): ReactNode {
  const [mode, setMode] = useState<MapMode>('map');
  const places = usePhotoPlaces();
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const countries = places.data;
  return (
    <PhotosFrame
      active="map"
      actions={MAP_ACTIONS}
      {...(countries === undefined ? {} : { subtitle: libraryLine(countries) })}
      scroll={!(compact && mode === 'map' && countries !== undefined && countries.length > 0)}
    >
      <View className="min-h-0 flex-1 gap-section-gap">
        <Segmented options={MODES} value={mode} onChange={setMode} label="View" />
        {countries === undefined ? <Loading places={places} /> : <OfflineNote />}
        {countries === undefined ? null : <Body mode={mode} countries={countries} />}
      </View>
    </PhotosFrame>
  );
}
