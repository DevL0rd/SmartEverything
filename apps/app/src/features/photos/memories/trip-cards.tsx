import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Memory, Trip } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Bars } from '../../../components/charts';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { coverFirst, useMemoryItems, type MemoryMedia } from './items';
import { MemoryPicture } from './memory-picture';
import { memoryTitle } from './model';
import { tripBars, tripBarsLabel, tripFigures, tripLines, tripWhen } from './trip-model';

interface TripProps {
  readonly trip: Trip;
  readonly onPlay: () => void;
}

function useCover(trip: Trip): MemoryMedia | null {
  const { items } = useMemoryItems(trip.id);
  return coverFirst(items, trip.coverItemId)[0] ?? null;
}

function PerDay({ trip, height }: { readonly trip: Trip; readonly height: number }): ReactNode {
  return (
    <Bars
      bars={tripBars(trip)}
      colour="viz-1"
      label={tripBarsLabel(trip)}
      height={height}
      formatValue={count}
    />
  );
}

function Figures({ trip }: { readonly trip: Trip }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-1">
      {tripFigures(trip).map((figure) => (
        <View key={figure.key}>
          <Text variant="body-strong" className="tabular-nums">
            {figure.value}
          </Text>
          <Text variant="caption" tone="variant">
            {figure.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DesktopTrip({ trip, onPlay }: TripProps): ReactNode {
  const title = memoryTitle(trip);
  return (
    <Card
      padding="none"
      label={`Play ${title}`}
      onPress={onPlay}
      className="min-w-0 shrink grow basis-96 flex-row gap-3.5 p-3"
    >
      <MemoryPicture item={useCover(trip)} size="thumb" className="h-28 w-37 rounded-sm" />
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row items-center gap-2">
          <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
            {title}
          </Text>
          <Badge label={tripWhen(trip)} />
        </View>
        <Figures trip={trip} />
        <PerDay trip={trip} height={20} />
      </View>
    </Card>
  );
}

function PhoneTrip({ trip, onPlay }: TripProps): ReactNode {
  const title = memoryTitle(trip);
  const [first, second] = tripLines(trip);
  return (
    <Card
      padding="none"
      label={`Play ${title}`}
      onPress={onPlay}
      className="flex-row items-center gap-3 p-2.5"
    >
      <MemoryPicture item={useCover(trip)} size="thumb" className="h-18 w-24 rounded-sm" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {first}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {second}
        </Text>
        <PerDay trip={trip} height={16} />
      </View>
    </Card>
  );
}

export function TripList({
  trips,
  compact,
  onPlay,
}: {
  readonly trips: readonly Trip[];
  readonly compact: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  return (
    <View className={compact ? 'gap-2' : 'flex-row flex-wrap gap-3'}>
      {trips.map((trip) => {
        const play = (): void => {
          onPlay(trip);
        };
        return compact ? (
          <PhoneTrip key={trip.id} trip={trip} onPlay={play} />
        ) : (
          <DesktopTrip key={trip.id} trip={trip} onPlay={play} />
        );
      })}
    </View>
  );
}
