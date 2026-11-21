import { storeUnit } from '../../store/host/unit';
import { changesAfter, indexPage, type IndexCursor } from '../sync/server-index';
import type { SyncScope } from '../sync/placement-scope';

export interface SyncChangesInput {
  readonly scope: SyncScope;
  readonly after: number;
}

export interface SyncIndexPageInput {
  readonly scope: SyncScope;
  readonly cursor: IndexCursor;
}

export const DRIVE_SYNC_CHANGES_UNIT = storeUnit((store, input: SyncChangesInput) =>
  changesAfter(store, input.scope, input.after),
);

export const DRIVE_SYNC_INDEX_PAGE_UNIT = storeUnit((store, input: SyncIndexPageInput) =>
  indexPage(store, input.scope, input.cursor),
);
