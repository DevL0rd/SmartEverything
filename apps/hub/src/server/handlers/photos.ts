import { PHOTOS_ENDPOINTS as E } from '@smarteverything/domain';
import { homeLocation } from '../../automations/world-v3/zone';
import type { DriveActor } from '../../drive/service-read';
import { MemoriesReader, type MemoryContext } from '../../photos/memories';
import { TimelineReader } from '../../photos/timeline';
import { TripsReader } from '../../photos/trips';
import type { StoreContext } from '../../store/context';
import type { Store } from '../../store/store';
import { profileIdOf, roleOfCaller, type Caller } from '../auth';
import { bound, type Bound } from '../router';

export interface PhotoReaders {
  readonly timeline: TimelineReader;
  readonly memories: MemoriesReader;
  readonly trips: TripsReader;
}

export function photoReaders(context: StoreContext): PhotoReaders {
  return {
    timeline: new TimelineReader(context),
    memories: new MemoriesReader(context),
    trips: new TripsReader(context),
  };
}

function actorOf(store: Store, caller: Caller): DriveActor {
  return { profileId: profileIdOf(store, caller), owner: roleOfCaller(caller) === 'owner' };
}

export function localDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function memoryContextOf(store: Store): MemoryContext {
  return {
    today: localDay(store.now(), store.settings.read().time_zone),
    home: homeLocation(store),
  };
}

type PhotoRouteName =
  'readTimelineBuckets' | 'readTimelinePage' | 'listMemories' | 'listMemoryItems' | 'listTrips';

export type PhotoRoutes = { readonly [N in PhotoRouteName]: Bound<(typeof E)[N]> };

export function photosRoutes(store: Store, readers: PhotoReaders): PhotoRoutes {
  return {
    readTimelineBuckets: bound(E.readTimelineBuckets, ({ query, caller }) =>
      readers.timeline.buckets(actorOf(store, caller), query),
    ),
    readTimelinePage: bound(E.readTimelinePage, ({ params, query, caller }) =>
      readers.timeline.page(actorOf(store, caller), params.month, query),
    ),
    listMemories: bound(E.listMemories, ({ caller }) =>
      readers.memories.list(actorOf(store, caller), memoryContextOf(store)),
    ),
    listMemoryItems: bound(E.listMemoryItems, ({ params, query, caller }) =>
      readers.memories.memoryItems(
        actorOf(store, caller),
        params.memoryId,
        memoryContextOf(store),
        query.cursor,
      ),
    ),
    listTrips: bound(E.listTrips, ({ caller }) =>
      readers.trips.list(actorOf(store, caller), homeLocation(store), {
        fromDay: null,
        toDay: null,
      }),
    ),
  };
}
