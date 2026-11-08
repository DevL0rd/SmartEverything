import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import type { DriveActor } from '../drive/service-read';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import type { DuplicatesService } from './duplicates';
import type { StacksService } from './stacks';

const E = PHOTOS_ENDPOINTS;

export interface PhotoDuplicateRoutes {
  readonly listPhotoDuplicates: Bound<typeof E.listPhotoDuplicates>;
  readonly readPhotoDuplicateStats: Bound<typeof E.readPhotoDuplicateStats>;
  readonly keepBestDuplicates: Bound<typeof E.keepBestDuplicates>;
  readonly markNotDuplicates: Bound<typeof E.markNotDuplicates>;
  readonly listStacks: Bound<typeof E.listStacks>;
  readonly readStack: Bound<typeof E.readStack>;
  readonly makeStackCover: Bound<typeof E.makeStackCover>;
}

export function photoDuplicateRoutes(
  store: Store,
  duplicates: DuplicatesService,
  stacks: StacksService,
): PhotoDuplicateRoutes {
  const actorOf = (caller: Caller): DriveActor => ({
    profileId: profileIdOf(store, caller),
    owner: roleOfCaller(caller) === 'owner',
  });
  return {
    listPhotoDuplicates: bound(E.listPhotoDuplicates, ({ query, caller }) => {
      const page = duplicates.groups(actorOf(caller), { media: true }, query.cursor);
      return { items: page.groups, next: page.next };
    }),
    readPhotoDuplicateStats: bound(E.readPhotoDuplicateStats, ({ caller }) =>
      duplicates.stats(actorOf(caller), { media: true }),
    ),
    keepBestDuplicates: bound(E.keepBestDuplicates, ({ body, caller }) =>
      duplicates.keepBest(actorOf(caller), body),
    ),
    markNotDuplicates: bound(E.markNotDuplicates, ({ body, caller }) => {
      duplicates.markNotDuplicates(actorOf(caller), body.sha256s);
      return { ok: true } as const;
    }),
    listStacks: bound(E.listStacks, ({ query, caller }) =>
      stacks.list(actorOf(caller), query.cursor),
    ),
    readStack: bound(E.readStack, ({ params, caller }) =>
      stacks.read(actorOf(caller), params.stackId),
    ),
    makeStackCover: bound(E.makeStackCover, ({ params, body, caller }) =>
      stacks.makeCover(actorOf(caller), params.stackId, body.itemId),
    ),
  };
}
