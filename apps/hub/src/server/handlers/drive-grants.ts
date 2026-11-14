import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { DriveGrants } from '../../drive/grants';
import type { Store } from '../../store/store';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf } from './drive-services';

type DriveGrantRoute =
  'listGrants' | 'setGrant' | 'removeGrant' | 'listSharedWithMe' | 'listSharedByMe';

export function driveGrantRoutes(store: Store, grants: DriveGrants): Routes<DriveGrantRoute> {
  return {
    listGrants: bound(E.listGrants, ({ params, caller }) =>
      refusing(() => grants.list(actorOf(store, caller), params.itemId)),
    ),
    setGrant: bound(E.setGrant, ({ body, caller }) =>
      refusing(() => grants.set(actorOf(store, caller), body)),
    ),
    removeGrant: bound(E.removeGrant, ({ params, caller }) =>
      refusing(() => {
        grants.remove(actorOf(store, caller), params.grantId);
        return DONE_REPLY;
      }),
    ),
    listSharedWithMe: bound(E.listSharedWithMe, ({ query, caller }) =>
      refusing(() => grants.sharedWithMe(actorOf(store, caller), query.cursor)),
    ),
    listSharedByMe: bound(E.listSharedByMe, ({ query, caller }) =>
      refusing(() => grants.sharedByMe(actorOf(store, caller), query.cursor)),
    ),
  };
}
