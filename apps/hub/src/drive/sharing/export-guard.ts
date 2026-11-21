import { ApiError, type DriveItem } from '@smarteverything/domain';
import { mayExport, type ItemAccess } from '../access';

export const VIEW_ONLY_REASON = 'drive_view_only';

export const VIEW_ONLY_MESSAGE =
  'This is view only: it can be opened here but not downloaded, copied, synced or taken out.';

export function viewOnlyRefusal(): ApiError {
  return new ApiError('forbidden', VIEW_ONLY_MESSAGE, VIEW_ONLY_REASON);
}

export function mayExportItem(access: ItemAccess, item: Pick<DriveItem, 'locked'>): boolean {
  return mayExport(access, item.locked);
}

export function requireExport(access: ItemAccess, item: Pick<DriveItem, 'locked'>): void {
  if (!mayExportItem(access, item)) throw viewOnlyRefusal();
}
