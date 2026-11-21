import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { DriveOffline } from '../../drive/offline';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf } from './drive-services';

type DriveOfflineRoute = 'listOffline' | 'setOffline' | 'reportOffline';

export function driveOfflineRoutes(offline: DriveOffline): Routes<DriveOfflineRoute> {
  return {
    listOffline: bound(E.listOffline, ({ query, caller }) =>
      refusing(() => offline.list(actorOf(caller), query.clientId, query.cursor)),
    ),
    setOffline: bound(E.setOffline, ({ body, caller }) =>
      refusing(async () => {
        await offline.set(actorOf(caller), body);
        return DONE_REPLY;
      }),
    ),
    reportOffline: bound(E.reportOffline, ({ body, caller }) =>
      refusing(async () => {
        await offline.report(actorOf(caller), body);
        return DONE_REPLY;
      }),
    ),
  };
}
