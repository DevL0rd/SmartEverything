import { useMemo } from 'react';
import type { PhotoInsights, TimelineBucket } from '@smarteverything/domain';
import { useDayKey } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useDriveAlbums } from '../../nas/data/tables';
import {
  PHOTO_ALL,
  usePhotoBuckets,
  usePhotoInsights,
  usePhotoPlaces,
  usePhotoRailCounts,
} from '../data';
import type { SearchSources } from './suggest';

const NONE: readonly never[] = [];

function monthsOf(buckets: readonly TimelineBucket[] | undefined): ReadonlyMap<string, number> {
  return new Map((buckets ?? NONE).map((bucket) => [bucket.month, bucket.count]));
}

function kindItems(insights: PhotoInsights | undefined, video: boolean): number | null {
  if (insights === undefined) return null;
  return insights.kinds
    .filter((kind) => (kind.kind === 'video') === video)
    .reduce((sum, kind) => sum + kind.items, 0);
}

export function useSearchSources(): SearchSources {
  const today = useDayKey();
  const latitude = useSettings().latitude;
  const buckets = usePhotoBuckets(PHOTO_ALL).data;
  const places = usePhotoPlaces().data;
  const insights = usePhotoInsights('all_time').data;
  const favourites = usePhotoRailCounts().data?.favourites ?? null;
  const albums = useDriveAlbums('photos');
  return useMemo(
    (): SearchSources => ({
      countries: places ?? NONE,
      albums,
      cameras: insights?.cameras ?? NONE,
      photos: kindItems(insights, false),
      videos: kindItems(insights, true),
      favourites,
      dates: { today, southern: latitude !== null && latitude < 0, months: monthsOf(buckets) },
    }),
    [places, albums, insights, favourites, today, latitude, buckets],
  );
}
