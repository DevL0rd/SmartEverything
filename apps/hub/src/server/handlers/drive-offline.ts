import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { DriveOffline } from '../../drive/offline';
import type { Store } from '../../store/store';
import { DONE_REPLY, bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf } from './drive-services';

type DriveOfflineRoute = 'listOffline' | 'setOffline' | 'reportOffline';

export function driveOfflineRoutes(store: Store, offline: DriveOffline): Routes<DriveOfflineRoute> {
  return {
    listOffline: bound(E.listOffline, ({ query, caller }) =>
      refusing(() => offline.list(actorOf(store, caller), query.clientId, query.cursor)),
    ),
    setOffline: bound(E.setOffline, ({ body, caller }) =>
      refusing(() => {
        offline.set(actorOf(store, caller), body);
        return DONE_REPLY;
      }),
    ),
    reportOffline: bound(E.reportOffline, ({ body, caller }) =>
      refusing(() => {
        offline.report(actorOf(store, caller), body);
        return DONE_REPLY;
      }),
    ),
  };
}
