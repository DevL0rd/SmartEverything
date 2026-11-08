import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { router } from 'expo-router';
import type { TimelineBucket } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { PhotoScope } from '../../../api/photos';
import { href } from '../../../app-shell/hrefs';
import { MediaGrid } from '../../../components/media-grid/media-grid';
import type { ResolveThumb } from '../../../components/media-grid/tile';
import { tilesOfPage } from '../../../components/media-grid/tiles';
import { useDayKey } from '../../../store/clock';
import { usePhotoMonth } from '../data';
import { driveLinks } from '../../nas/data/links';
import { feedMonths, feedTiles, type MonthTiles } from './place-model';

const resolveThumb: ResolveThumb = (tile) => driveLinks.resolve(tile.id, tile.rev, 'thumb');

function MonthLoader({
  month,
  scope,
  onTiles,
}: {
  readonly month: string;
  readonly scope: PhotoScope;
  readonly onTiles: (month: string, tiles: MonthTiles) => void;
}): ReactNode {
  const pages = usePhotoMonth(month, scope, true);
  const { data, hasNextPage, fetchNextPage } = pages;
  useEffect(() => {
    if (data === undefined) return;
    onTiles(month, {
      tiles: data.pages.flatMap(tilesOfPage),
      more: hasNextPage
        ? (): void => {
            background(fetchNextPage(), 'place.month_failed', { month });
          }
        : null,
    });
  }, [data, hasNextPage, fetchNextPage, month, onTiles]);
  return null;
}

export interface PlaceFeedProps {
  readonly buckets: readonly TimelineBucket[];
  readonly scope: PhotoScope;
  readonly month: string | null;
  readonly header: ReactElement;
  readonly empty: ReactElement;
}

export function PlaceFeed({ buckets, scope, month, header, empty }: PlaceFeedProps): ReactNode {
  const today = useDayKey();
  const months = feedMonths(buckets, month);
  const [shown, setShown] = useState(1);
  const [loaded, setLoaded] = useState<ReadonlyMap<string, MonthTiles>>(new Map());
  const [onTiles] = useState(() => (key: string, tiles: MonthTiles): void => {
    setLoaded((before) => new Map(before).set(key, tiles));
  });
  const live = months.slice(0, shown);
  const last = live.at(-1);
  return (
    <>
      {live.map((key) => (
        <MonthLoader key={key} month={key} scope={scope} onTiles={onTiles} />
      ))}
      <MediaGrid
        tiles={feedTiles(live, loaded)}
        step="days"
        today={today}
        header={header}
        empty={empty}
        resolveThumb={resolveThumb}
        onOpen={(tile) => {
          router.push(href.photosItem(tile.id, { place: String(scope.placeId) }));
        }}
        onEndReached={() => {
          const more = last === undefined ? null : (loaded.get(last)?.more ?? null);
          if (more !== null) more();
          else if (shown < months.length) setShown(shown + 1);
        }}
      />
    </>
  );
}
