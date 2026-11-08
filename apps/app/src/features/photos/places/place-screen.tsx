import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  PLACE_PARAMS,
  type Memory,
  type PhotoPlace,
  type TimelineBucket,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { Crumb } from '../../../components/breadcrumbs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { FlatChoice } from '../../../components/flat-choice';
import type { HeaderAction } from '../../../components/page-header';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { count } from '../../../format/number';
import { useSyncStatus } from '../../../store/selectors';
import { ChipRow } from '../../nas/frame';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoBuckets, usePhotoMemories, usePhotoPlace } from '../data';
import { MemoryPlayer } from '../memories';
import { MiniMap } from '../world-map';
import { PlaceFeed } from './place-feed';
import { placeMemoryOf, totalOf, visitChips } from './place-model';
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

export function itemsLabel(items: number, videos: number | null): string {
  if (videos === null) return 'items';
  return `items · ${count(Math.max(0, items - videos))} photos, ${count(videos)} videos`;
}

function figure(value: number | null): string {
  return value === null ? '–' : count(value);
}

function StatsCard({
  place,
  buckets,
}: {
  readonly place: PhotoPlace;
  readonly buckets: readonly TimelineBucket[];
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
        <Stat value={count(place.count)} label={itemsLabel(place.count, videos)} />
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
  readonly buckets: readonly TimelineBucket[];
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
        {`The Timeline, only photos taken within ${name}`}
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

function PlaceBody({ place }: { readonly place: PhotoPlace }): ReactNode {
  const [choice, setChoice] = useState<Choice>({ month: null, kind: 'all' });
  const all = usePhotoBuckets({ filter: 'all', placeId: place.id });
  const scope = { filter: choice.kind, placeId: place.id };
  const scoped = usePhotoBuckets(scope);
  const buckets = all.data;
  if (buckets === undefined) {
    return all.isError ? (
      <Unavailable error={all.error} retry={all.refetch} />
    ) : (
      <Skeleton shape="block" className="h-45 w-full" />
    );
  }
  const header = (
    <View className="gap-2 px-gutter pb-2">
      <StatsCard place={place} buckets={buckets} />
      <Chips name={place.name} buckets={buckets} choice={choice} onChoice={setChoice} />
    </View>
  );
  return (
    <PlaceFeed
      key={`${choice.kind}:${choice.month ?? 'all'}`}
      buckets={scoped.data ?? []}
      scope={scope}
      month={choice.month}
      header={header}
      empty={
        <EmptyState
          icon="image"
          title="No photos match"
          body="Choose All visits and All to see every photo from here."
        />
      }
    />
  );
}

const MAP_CRUMB: Crumb = { label: 'Map and places', href: href.photosPage('map') };

function crumbsOf(place: PhotoPlace | undefined): readonly Crumb[] {
  return place === undefined ? [MAP_CRUMB] : [MAP_CRUMB, { label: place.country }];
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
  if (query.data !== undefined) return <PlaceBody place={query.data} />;
  if (!query.isError) return <Skeleton shape="block" className="h-45 w-full" />;
  return <Unavailable error={query.error} retry={query.refetch} />;
}

export function playActions(memory: Memory | null, play: () => void): readonly HeaderAction[] {
  if (memory === null) return [];
  return [{ icon: 'play', label: 'Play memory', primary: true, onPress: play }];
}

function usePlaceMemory(placeId: number | null): Memory | null {
  const memories = usePhotoMemories().data;
  return memories === undefined || placeId === null ? null : placeMemoryOf(memories, placeId);
}

export function PlaceScreen(): ReactNode {
  const placeId = placeIdOf(useLocalSearchParams()['placeId']);
  const query = usePhotoPlace(placeId);
  const place = query.data;
  const memory = usePlaceMemory(placeId);
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const [playing, setPlaying] = useState(false);
  return (
    <PhotosFrame
      active="map"
      title={place?.name ?? 'Place'}
      breadcrumbs={crumbsOf(place)}
      scroll={false}
      actions={playActions(memory, () => {
        setPlaying(true);
      })}
    >
      <PlaceState placeId={placeId} query={query} />
      {playing && memory !== null ? (
        <MemoryPlayer
          key={memory.id}
          memory={memory}
          compact={compact}
          onClose={() => {
            setPlaying(false);
          }}
        />
      ) : null}
    </PhotosFrame>
  );
}
