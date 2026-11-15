import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
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
import { measureAnchor, type Rect } from '../../../components/anchor';
import type { Crumb } from '../../../components/breadcrumbs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { FilterChip } from '../../../components/filter-chip';
import { FlatChoice } from '../../../components/flat-choice';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import { useMediaSelection } from '../../../components/media-grid/selection';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { SelectPicker, type SelectOption } from '../../../components/select-picker';
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
import { monthScopeOf, photosText, totalOf, visitChips } from './place-model';
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
    <View className="w-1/2 gap-0.5 py-1.5 pr-3 medium:w-1/4">
      <Text variant="title-2" className="tabular-nums">
        {value}
      </Text>
      <Text variant="caption" tone="variant" numberOfLines={1}>
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
      <View className="flex-1 justify-center gap-2 p-4 medium:px-6">
        <View className="flex-row flex-wrap">
          <Stat value={count(place.count)} label={itemsLabel(place.count)} />
          <Stat value={count(months.length)} label={months.length === 1 ? 'month' : 'months'} />
          <Stat value={figure(videos)} label="videos" />
          <Stat value={figure(favourites)} label="favourites" />
        </View>
        {first === undefined || latest === undefined ? null : (
          <Text variant="footnote" tone="variant" className="tabular-nums">
            {first === latest
              ? `Taken in ${monthLabel(first)}`
              : `First ${monthLabel(first)} · latest ${monthLabel(latest)}`}
          </Text>
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

const ALL_MONTHS = 'all';

function sumOf(buckets: readonly LibraryBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

function monthOptionsOf(buckets: readonly LibraryBucket[]): readonly SelectOption<string>[] {
  return [
    { value: ALL_MONTHS, label: 'All months', description: photosText(sumOf(buckets)) },
    ...visitChips(buckets).map((chip) => ({
      value: chip.month,
      label: chip.label,
      description: photosText(chip.count),
    })),
  ];
}

function MonthChip({ buckets, choice, onChoice }: ChipsProps): ReactNode {
  const ref = useRef<View>(null);
  const opener = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return (
    <>
      <FilterChip
        affordance="menu"
        expanded={anchor !== null}
        anchorRef={ref}
        pressRef={opener}
        label="Month"
        value={choice.month === null ? 'All months' : monthLabel(choice.month)}
        icon="calendar"
        active={choice.month !== null}
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label="Month"
        options={monthOptionsOf(buckets)}
        value={choice.month ?? ALL_MONTHS}
        anchor={anchor}
        opener={opener}
        onClose={() => {
          setAnchor(null);
        }}
        onPick={(month) => {
          onChoice({ ...choice, month: month === ALL_MONTHS ? null : month });
        }}
      />
    </>
  );
}

function Chips(chips: ChipsProps): ReactNode {
  const { choice, onChoice } = chips;
  return (
    <View className="pt-section-gap">
      <ChipRow label="Filters">
        {KINDS.map((kind) => (
          <FlatChoice
            key={kind.value}
            label={kind.label}
            active={choice.kind === kind.value}
            role="radio"
            onPress={() => {
              onChoice({ ...choice, kind: kind.value });
            }}
          />
        ))}
        {chips.buckets.length > 1 ? <MonthChip {...chips} /> : null}
      </ChipRow>
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
    body="Choose All and All months to see every photo from here."
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
  const select: readonly ShellAction[] =
    controls.selection.active || feed.tiles.length === 0
      ? []
      : [{ icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin }];
  const header = (
    <View className="gap-2 px-gutter pb-2">
      <StatsCard place={place} buckets={buckets} />
      <Chips
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
      actions={select}
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
        <PlaceLoading />
      )}
    </PhotosFrame>
  );
}

function PlaceLoading(): ReactNode {
  return (
    <View aria-busy accessibilityLabel="Loading this place">
      <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 medium:flex-row">
        <Skeleton shape="block" className="h-36 rounded-none medium:h-45 medium:w-90" />
        <View className="flex-1 justify-center gap-2 p-4 medium:px-6">
          <View className="flex-row flex-wrap">
            {['items', 'months', 'videos', 'favourites'].map((key) => (
              <View key={key} className="w-1/2 gap-1.5 py-1.5 pr-3 medium:w-1/4">
                <Skeleton shape="line" className="h-6 w-14" />
                <Skeleton shape="line" className="h-3 w-20" />
              </View>
            ))}
          </View>
          <Skeleton shape="line" className="h-3 w-48" />
        </View>
      </View>
      <View className="flex-row gap-2 pt-section-gap">
        {['all', 'videos', 'favourites', 'month'].map((key) => (
          <Skeleton key={key} shape="line" className="h-8 w-20" />
        ))}
      </View>
      <LibraryLoading />
    </View>
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
  if (!query.isError) return <PlaceLoading />;
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
