import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { MediaInfo } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { wallDayKey } from '../../../components/media-grid/tiles';
import { Text } from '../../../components/text';
import { useDriveLink } from '../../nas/data/links';
import { PHOTO_ALL } from '../data/keys';
import { usePhotoSearch } from '../data/library';
import { usePhotoBuckets } from '../data/queries';
import { SEARCH_MEDIA } from '../search/tokens';
import type { MediaItem } from './info-model';
import { otherYearDays } from './this-day';

function YearShot({
  day,
  onOpen,
}: {
  readonly day: string;
  readonly onOpen: (itemId: string) => void;
}): ReactNode {
  const search = usePhotoSearch(
    {
      text: null,
      starred: null,
      duration: null,
      taken: { from: day, to: day },
      kinds: SEARCH_MEDIA,
    },
    true,
  );
  const first = search.data?.pages[0]?.items[0] ?? null;
  const url = useDriveLink(first?.id ?? null, first?.rev ?? 1, 'thumb');
  if (first === null) return null;
  const year = day.slice(0, 4);
  return (
    <Interactive
      label={`${first.name}, ${year}`}
      onPress={() => {
        onOpen(first.id);
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
