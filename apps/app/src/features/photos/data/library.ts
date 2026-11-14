import type { DriveResult } from '../../../api/drive';
import { type DrivePages, useDriveTrash } from '../../drive';

export function usePhotoDeleted(): DrivePages<DriveResult<'listTrash'>> {
  return useDriveTrash(null);
}
