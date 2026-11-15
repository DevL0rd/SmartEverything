import { ApiError, type DriveItem } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { itemAccess, mayExport, type DriveActor, type ItemAccess } from '../access';

export const VIEW_ONLY_REASON = 'drive_view_only';

export const VIEW_ONLY_MESSAGE =
  'This is view only: it can be opened here but not downloaded, copied, synced or taken out.';

export type ExportStore = Pick<Store, 'driveGrants' | 'driveItems' | 'driveRoots'>;

export function viewOnlyRefusal(): ApiError {
  return new ApiError('forbidden', VIEW_ONLY_MESSAGE, VIEW_ONLY_REASON);
}

export function mayExportItem(access: ItemAccess, item: Pick<DriveItem, 'locked'>): boolean {
  return mayExport(access, item.locked);
}

export function requireExport(access: ItemAccess, item: Pick<DriveItem, 'locked'>): void {
  if (!mayExportItem(access, item)) throw viewOnlyRefusal();
}

export class ExportGuard {
  constructor(private readonly store: ExportStore) {}

  access(actor: DriveActor, item: DriveItem): ItemAccess {
    return itemAccess(this.store, actor, this.store.driveRoots.byId(item.rootId), item);
  }

  may(actor: DriveActor, item: DriveItem): boolean {
    return mayExportItem(this.access(actor, item), item);
  }

  require(actor: DriveActor, item: DriveItem): void {
    requireExport(this.access(actor, item), item);
  }

  requireSubtree(actor: DriveActor, folder: DriveItem, items: readonly DriveItem[]): void {
    this.require(actor, folder);
    for (const item of items) this.require(actor, item);
  }
}
