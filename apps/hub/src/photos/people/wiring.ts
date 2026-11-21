import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import type { PhotoMergeSuggestion } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { PhotoAi } from '../ai/service';
import type { LibraryPages } from '../library';
import { photoPeopleRoutes, type PhotoPeopleRoutes } from './routes';
import { PhotoSearch } from './search';
import { hostedPeople } from './people-store';
import { PeopleService } from './service';

const log = new Logger('hub.photos');

export interface PeopleWiring {
  readonly store: Store;
  readonly ai: PhotoAi;
  readonly timeZone: () => string;
}

export function startPeople(wiring: PeopleWiring): PeopleService {
  const { store, ai } = wiring;
  const service = new PeopleService({
    store: hostedPeople(store.host),
    newId: randomUUID,
    log,
    regrouped: (profileId): void => {
      store.feed.notice({ type: 'photos_people_changed', profileId });
    },
    suggestions: (profileId): Promise<readonly PhotoMergeSuggestion[]> =>
      store.host.read('photoMergeSuggestions', { profileId }),
  });
  const regroup = (): void => {
    service.drained().catch((cause: unknown) => {
      log.error('groups.regroup_failed', cause);
    });
  };
  ai.onFacesIdle(regroup);
  regroup();
  return service;
}

export function photoPeople(wiring: PeopleWiring): PhotoPeopleRoutes {
  const { store, ai, timeZone } = wiring;
  const service = startPeople(wiring);
  const pages: LibraryPages = {
    buckets: (actor, scope, meaning) =>
      store.host.read('photoBuckets', { actor, scope, meaning, timeZone: timeZone() }),
    page: (actor, month, query, meaning) =>
      store.host.read('photoPage', { actor, month, query, meaning, timeZone: timeZone() }),
  };
  const search = new PhotoSearch(pages, ai, log, Date.now);
  return photoPeopleRoutes(service, search);
}
