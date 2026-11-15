import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Store } from '../../store/store';
import type { PhotoAi } from '../ai/service';
import { LibraryReader } from '../library';
import { photoPeopleRoutes, type PhotoPeopleRoutes } from './routes';
import { PhotoSearch } from './search';
import { PeopleService } from './service';
import { PhotoSuggest } from './suggest';

const PROFILE = z.strictObject({ id: z.string() });

const log = new Logger('hub.photos');

export interface PeopleWiring {
  readonly store: Store;
  readonly ai: PhotoAi;
  readonly timeZone: () => string;
}

export function startPeople(wiring: PeopleWiring): PeopleService {
  const { store, ai } = wiring;
  const service = new PeopleService({
    context: store.context,
    groups: store.photoGroups,
    faces: store.photoFaces,
    consent: ai.consent,
    newId: randomUUID,
    log,
    profiles: (): readonly string[] =>
      store.context.sql.all(PROFILE, 'select id from profiles order by id').map((row) => row.id),
    regrouped: (profileId): void => {
      store.feed.notice({ type: 'photos_people_changed', profileId });
    },
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
  const search = new PhotoSearch(new LibraryReader(store.context, timeZone), ai, log, Date.now);
  return photoPeopleRoutes(
    store,
    service,
    search,
    new PhotoSuggest(store.context, service, store.photoGroups),
  );
}
