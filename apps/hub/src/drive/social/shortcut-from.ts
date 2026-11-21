import { DRIVE_SHORTCUT, type DriveShortcut } from '@smarteverything/domain';
import type { DriveShortcutRecord } from '../../store/repositories/drive-shortcuts';

export function shortcutFrom(
  record: DriveShortcutRecord,
  target: DriveShortcut['target'],
): DriveShortcut {
  return DRIVE_SHORTCUT.parse({
    id: record.id,
    rootId: record.rootId,
    parentId: record.parentId,
    name: record.name,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    target,
  });
}
