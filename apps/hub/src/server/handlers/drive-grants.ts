import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { DriveGrants } from '../../drive/grants';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf } from './drive-services';

type DriveGrantRoute =
  'listGrants' | 'setGrant' | 'removeGrant' | 'listSharedWithMe' | 'listSharedByMe';

export function driveGrantRoutes(grants: DriveGrants): Routes<DriveGrantRoute> {
  return {
    listGrants: bound(E.listGrants, ({ params, caller }) =>
      refusing(() => grants.list(actorOf(caller), params.itemId)),
    ),
    setGrant: bound(E.setGrant, ({ body, caller }) =>
      refusing(() => grants.set(actorOf(caller), body)),
    ),
    removeGrant: bound(E.removeGrant, ({ params, caller }) =>
      refusing(async () => {
        await grants.remove(actorOf(caller), params.grantId);
        return DONE_REPLY;
      }),
    ),
    listSharedWithMe: bound(E.listSharedWithMe, ({ query, caller }) =>
      refusing(() => grants.sharedWithMe(actorOf(caller), query.cursor)),
    ),
    listSharedByMe: bound(E.listSharedByMe, ({ query, caller }) =>
      refusing(() => grants.sharedByMe(actorOf(caller), query.cursor)),
    ),
  };
}
