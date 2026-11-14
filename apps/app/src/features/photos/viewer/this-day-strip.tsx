import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { MediaInfo } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { tilesOfPage, wallDayKey } from '../../../components/media-grid/tiles';
import { Text } from '../../../components/text';
import { flattenPages, useDriveLink } from '../../drive';
import { PHOTO_ALL } from '../data/keys';
import { usePhotoBuckets, usePhotoMonth } from '../data/queries';
import type { MediaItem } from './info-model';
import { otherYearDays } from './this-day';

function YearShot({
  day,
  onOpen,
}: {
  readonly day: string;
  readonly onOpen: (itemId: string) => void;
}): ReactNode {
  const month = usePhotoMonth(day.slice(0, 7), { filter: 'all', from: day, to: day }, true);
  const tile = month.data === undefined ? null : (flattenPages(month.data, tilesOfPage)[0] ?? null);
  const url = useDriveLink(tile?.id ?? null, tile?.rev ?? 1, 'thumb');
  if (tile === null) return null;
  const year = day.slice(0, 4);
  return (
    <Interactive
      label={`Photo from ${year}`}
      onPress={() => {
        onOpen(tile.id);
      }}
      className="w-18 gap-1"
      layerClassName="rounded-sm"
    >
      <View className="h-13.5 w-18 overflow-hidden rounded-sm bg-surface-3">
        {url === null ? null : (
          <Image
            source={{ uri: url }}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        )}
      </View>
      <Text variant="caption" tone="variant" className="tabular-nums">
        {year}
      </Text>
    </Interactive>
  );
}

export function ThisDayStrip({
  item,
  media,
  onOpen,
}: {
  readonly item: MediaItem;
  readonly media: MediaInfo | null;
  readonly onOpen: (itemId: string) => void;
}): ReactNode {
  const buckets = usePhotoBuckets(PHOTO_ALL);
  if (item.takenAt === null || buckets.data === undefined) return null;
  const day = wallDayKey(Date.parse(item.takenAt), media?.tzOffsetMin ?? null);
  const days = otherYearDays(buckets.data, day);
  if (days.length === 0) return null;
  return (
    <View className="gap-2 pt-2">
      <Text variant="footnote" tone="variant">
        This day in other years
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {days.map((other) => (
          <YearShot key={other} day={other} onOpen={onOpen} />
        ))}
      </View>
    </View>
  );
}
