import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { homeLocation } from '../automations/world-v3/zone';
import { localDay } from '../server/handlers/photos';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import { photoActor } from './actor';
import type { InsightsReader } from './insights';
import type { InsightsContext } from './insights-shapes';
import type { RailCountsReader } from './insights-rail';

const E = PHOTOS_ENDPOINTS;

export interface PhotoInsightReaders {
  readonly insights: InsightsReader;
  readonly rail: RailCountsReader;
}

export interface PhotoInsightRoutes {
  readonly readPhotoInsights: Bound<typeof E.readPhotoInsights>;
  readonly readPhotoRailCounts: Bound<typeof E.readPhotoRailCounts>;
  readonly listPhotoLargestVideos: Bound<typeof E.listPhotoLargestVideos>;
  readonly listPhotoBusiestDays: Bound<typeof E.listPhotoBusiestDays>;
}

function contextOf(store: Store): InsightsContext {
  return {
    today: localDay(store.now(), store.settings.read().time_zone),
    home: homeLocation(store),
  };
}

export function photoInsightRoutes(store: Store, readers: PhotoInsightReaders): PhotoInsightRoutes {
  return {
    readPhotoInsights: bound(E.readPhotoInsights, ({ query, caller }) =>
      readers.insights.read(photoActor(store, caller), query.range, contextOf(store)),
    ),
    listPhotoLargestVideos: bound(E.listPhotoLargestVideos, ({ query, caller }) =>
      readers.insights.largestVideosPage(
        photoActor(store, caller),
        query.range,
        query.cursor,
        contextOf(store),
      ),
    ),
    listPhotoBusiestDays: bound(E.listPhotoBusiestDays, ({ query, caller }) =>
      readers.insights.busiestDaysPage(
        photoActor(store, caller),
        query.range,
        query.cursor,
        contextOf(store),
      ),
    ),
    readPhotoRailCounts: bound(E.readPhotoRailCounts, ({ caller }) =>
      readers.rail.read(photoActor(store, caller)),
    ),
  };
}
