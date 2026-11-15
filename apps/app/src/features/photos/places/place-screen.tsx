import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  ApiError,
  PLACE_PARAMS,
  type LibraryBucket,
  type LibraryScope,
  type PhotoPlace,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { Crumb } from '../../../components/breadcrumbs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { FlatChoice } from '../../../components/flat-choice';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import { useMediaSelection } from '../../../components/media-grid/selection';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { count } from '../../../format/number';
import { useSyncStatus } from '../../../store/selectors';
import { ChipRow } from '../../../components/chip-row';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoBuckets, usePhotoPlace } from '../data';
import { LibraryGrid } from '../library/library-grid';
import { selectionFrameOf } from '../library/library-selection';
import { LibraryError, LibraryLoading } from '../library/library-states';
import { useLibraryFeed, type LibraryFeed } from '../library/use-library-feed';
import { useMediaActions } from '../library/use-media-actions';
import { viewerParamsOf } from '../viewer/params';
import { MiniMap } from '../world-map';
import { monthScopeOf, totalOf, visitChips } from './place-model';
import { monthLabel, monthsOf } from './time-range';

type KindFilter = 'all' | 'videos' | 'favourites';

const KINDS: readonly { readonly value: KindFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'videos', label: 'Videos' },
  { value: 'favourites', label: 'Favourites' },
];

export function placeIdOf(raw: unknown): number | null {
  const parsed = PLACE_PARAMS.safeParse({ placeId: raw });
  return parsed.success ? parsed.data.placeId : null;
}

function Stat({ value, label }: { readonly value: string; readonly label: string }): ReactNode {
  return (
    <View className="min-w-20 gap-0.5">
      <Text variant="title-2" className="tabular-nums">
        {value}
      </Text>
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

export function itemsLabel(items: number): string {
  return items === 1 ? 'photo or video' : 'photos and videos';
}

function figure(value: number | null): string {
  return value === null ? '–' : count(value);
}

function StatsCard({
  place,
  buckets,
}: {
  readonly place: PhotoPlace;
  readonly buckets: readonly LibraryBucket[];
}): ReactNode {
  const months = monthsOf(buckets);
  const first = months[0]?.month;
  const latest = months.at(-1)?.month;
  const videos = totalOf(usePhotoBuckets({ filter: 'videos', placeId: place.id }).data);
  const favourites = totalOf(usePhotoBuckets({ filter: 'favourites', placeId: place.id }).data);
  return (
    <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 medium:flex-row">
      <MiniMap
        point={place}
        label={`Map around ${place.name}`}
        className="h-36 medium:h-45 medium:w-90"
      />
      <View className="flex-1 flex-row flex-wrap items-center gap-6 p-4 medium:px-6">
        <Stat value={count(place.count)} label={itemsLabel(place.count)} />
        <Stat value={count(months.length)} label={months.length === 1 ? 'visit' : 'visits'} />
        <Stat value={figure(videos)} label="videos" />
        <Stat value={figure(favourites)} label="favourites" />
        {first === undefined || latest === undefined ? null : (
          <View className="gap-0.5">
            <Text variant="footnote" className="tabular-nums">
              {first === latest
                ? monthLabel(first)
                : `${monthLabel(first)} to ${monthLabel(latest)}`}
            </Text>
            <Text variant="caption" tone="variant">
              first and latest
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface Choice {
  readonly month: string | null;
  readonly kind: KindFilter;
}

interface ChipsProps {
  readonly buckets: readonly LibraryBucket[];
  readonly choice: Choice;
  readonly onChoice: (choice: Choice) => void;
}

function VisitChips({ buckets, choice, onChoice }: ChipsProps): ReactNode {
  return (
    <ChipRow label="Visits">
      <FlatChoice
        label="All visits"
        count={totalOf(buckets) ?? undefined}
        active={choice.month === null}
        role="radio"
        onPress={() => {
          onChoice({ ...choice, month: null });
        }}
      />
      {visitChips(buckets).map((chip) => (
        <FlatChoice
          key={chip.month}
          label={chip.label}
          count={chip.count}
          active={choice.month === chip.month}
          role="radio"
          onPress={() => {
            onChoice({ ...choice, month: chip.month });
          }}
        />
      ))}
    </ChipRow>
  );
}

function KindChips({ choice, onChoice }: Omit<ChipsProps, 'buckets'>): ReactNode {
  return (
    <ChipRow label="Kinds">
      {KINDS.map((kind) => (
        <FlatChoice
          key={kind.value}
          label={kind.label}
          active={choice.kind === kind.value}
          role="radio"
          onPress={() => {
            onChoice({ month: null, kind: kind.value });
          }}
        />
      ))}
    </ChipRow>
  );
}

function Chips({ name, ...chips }: ChipsProps & { readonly name: string }): ReactNode {
  return (
    <View className="gap-2 pt-section-gap">
      <Text variant="caption" tone="variant">
        Photos per visit
      </Text>
      <VisitChips {...chips} />
      <KindChips choice={chips.choice} onChoice={chips.onChoice} />
      <Text variant="footnote" tone="variant">
        {`The Library, only photos taken within ${name}`}
      </Text>
    </View>
  );
}

function Unavailable({
  error,
  retry,
}: {
  readonly error: Error;
  readonly retry: () => Promise<unknown>;
}): ReactNode {
  const live = useSyncStatus().status === 'live';
  if (!live) {
    return (
      <EmptyState
        icon="wifiOff"
        title="The hub is offline"
        body="This place opens when the hub reconnects. Its photos stay on the hub as they are."
      />
    );
  }
  return (
    <ErrorState
      error={error}
      page
      retry={() => {
        background(retry(), 'place.refetch_failed');
      }}
    />
  );
}

export function placeScopeOf(placeId: number, choice: Choice): LibraryScope {
  return {
    filter: choice.kind,
    placeId,
    ...(choice.month === null ? {} : monthScopeOf(choice.month)),
  };
}

const MAP_CRUMB: Crumb = { label: 'Map and places', href: href.photosPage('map') };

function crumbsOf(place: PhotoPlace | undefined): readonly Crumb[] {
  return place === undefined ? [MAP_CRUMB] : [MAP_CRUMB, { label: place.country }];
}

const NO_MATCH = (
  <EmptyState
    icon="image"
    title="No photos match"
    body="Choose All visits and All to see every photo from here."
  />
);

function PlaceGrid({
  feed,
  header,
  scope,
  controls,
  media,
}: {
  readonly feed: LibraryFeed;
  readonly header: ReactElement;
  readonly scope: LibraryScope;
  readonly controls: ReturnType<typeof useMediaSelection>;
  readonly media: ReturnType<typeof useMediaActions>;
}): ReactNode {
  const [step, setStep] = useState<MediaZoomStep>('days');
  if (feed.state === 'loading' || feed.state === 'error') {
    return (
      <View className="min-h-0 flex-1">
        {header}
        {feed.state === 'loading' ? <LibraryLoading /> : <LibraryError onRetry={feed.retry} />}
      </View>
    );
  }
  return (
    <LibraryGrid
      tiles={feed.tiles}
      step={step}
      onStep={setStep}
      selection={controls}
      media={media}
      empty={NO_MATCH}
      footer={<View />}
      header={header}
      viewer={viewerParamsOf(scope)}
      onEnd={feed.onEnd}
    />
  );
}

function PlaceFeed({
  place,
  buckets,
}: {
  readonly place: PhotoPlace;
  readonly buckets: readonly LibraryBucket[];
}): ReactNode {
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const [choice, setChoice] = useState<Choice>({ month: null, kind: 'all' });
  const scope = useMemo(() => placeScopeOf(place.id, choice), [place.id, choice]);
  const feed = useLibraryFeed(scope);
  const controls = useMediaSelection(feed.tiles.map((tile) => tile.id));
  const media = useMediaActions();
  const frame = selectionFrameOf(compact, { controls, tiles: feed.tiles, media });
  const header = (
    <View className="gap-2 px-gutter pb-2">
      <StatsCard place={place} buckets={buckets} />
      <Chips
        name={place.name}
        buckets={buckets}
        choice={choice}
        onChoice={(next) => {
          controls.clear();
          setChoice(next);
        }}
      />
    </View>
  );
  return (
    <PhotosFrame
      active="map"
      title={place.name}
      breadcrumbs={crumbsOf(place)}
      scroll={false}
      selection={frame.selection}
      footer={frame.footer}
    >
      {feed.sources}
      <View className="-mx-gutter min-h-0 flex-1">
        <PlaceGrid feed={feed} header={header} scope={scope} controls={controls} media={media} />
      </View>
    </PhotosFrame>
  );
}

function PlaceBody({ place }: { readonly place: PhotoPlace }): ReactNode {
  const all = usePhotoBuckets({ filter: 'all', placeId: place.id });
  if (all.data !== undefined) return <PlaceFeed place={place} buckets={all.data} />;
  return (
    <PhotosFrame active="map" title={place.name} breadcrumbs={crumbsOf(place)}>
      {all.isError ? (
        <Unavailable error={all.error} retry={all.refetch} />
      ) : (
        <Skeleton shape="block" className="h-45 w-full" />
      )}
    </PhotosFrame>
  );
}

const GONE = (
  <EmptyState
    icon="mapPin"
    title="This place is gone"
    body="Its photos no longer have this location. Open another place from Map and places."
    action={<Button label="Open Map and places" variant="tonal" href={href.photosPage('map')} />}
  />
);

function isMissing(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'not_found';
}

function PlaceState({
  placeId,
  query,
}: {
  readonly placeId: number | null;
  readonly query: ReturnType<typeof usePhotoPlace>;
}): ReactNode {
  if (placeId === null) {
    return (
      <EmptyState
        icon="mapPin"
        title="This place is not known"
        body="Open a place from Map and places."
        action={
          <Button label="Open Map and places" variant="tonal" href={href.photosPage('map')} />
        }
      />
    );
  }
  if (isMissing(query.error)) return GONE;
  if (!query.isError) return <Skeleton shape="block" className="h-45 w-full" />;
  return <Unavailable error={query.error} retry={query.refetch} />;
}

export function PlaceScreen(): ReactNode {
  const placeId = placeIdOf(useLocalSearchParams()['placeId']);
  const query = usePhotoPlace(placeId);
  if (query.data !== undefined) return <PlaceBody place={query.data} />;
  return (
    <PhotosFrame active="map" title="Place" breadcrumbs={crumbsOf(undefined)}>
      <PlaceState placeId={placeId} query={query} />
    </PhotosFrame>
  );
}
