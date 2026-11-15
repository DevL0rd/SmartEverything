import { API_ENDPOINTS as E } from '@smarteverything/domain';
import {
  archiveEntryLink,
  itemText,
  listArchive,
  type DriveContentDeps,
} from '../../drive/content/content-reads';
import type { Store } from '../../store/store';
import { bound, type Routes } from '../router';
import { refusing } from './drive-errors';
import { actorOf } from './drive-services';

type DriveContentRoute = 'listZipEntries' | 'zipEntryLink' | 'readItemText';

export function driveContentRoutes(
  store: Store,
  deps: DriveContentDeps,
): Routes<DriveContentRoute> {
  return {
    listZipEntries: bound(E.listZipEntries, ({ params, query, caller }) =>
      refusing(() => listArchive(deps, actorOf(store, caller), params.itemId, query.cursor)),
    ),
    zipEntryLink: bound(E.zipEntryLink, ({ params, query, caller }) =>
      refusing(() => archiveEntryLink(deps, actorOf(store, caller), params.itemId, query.index)),
    ),
    readItemText: bound(E.readItemText, ({ params, caller }) =>
      refusing(() => itemText(deps, actorOf(store, caller), params.itemId)),
    ),
  };
}
