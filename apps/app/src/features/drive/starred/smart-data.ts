import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { createDriveAlbum, removeDriveAlbum, updateDriveAlbum } from '../../../api/drive';
import { confirm } from '../../../components/confirm-store';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { flattenPages, useDriveAlbumItems, useDriveAlbums } from '../data';
import { createBody, renameBody, type SmartDraft } from './rule-chips';
import { smartFoldersOf, smartStatsOf, type SmartFolder, type SmartStats } from './smart-model';

const log = new Logger('app.drive');

export type AlbumPages = ReturnType<typeof useDriveAlbumItems>;

export interface LoadedWindow {
  readonly items: readonly DriveItem[];
  readonly complete: boolean;
}

export function windowOf(pages: AlbumPages): LoadedWindow {
  return {
    items: flattenPages(pages.data, (page) => page.items),
    complete: pages.data !== undefined && !pages.hasNextPage,
  };
}

export function useSmartFolders(): readonly SmartFolder[] {
  return smartFoldersOf(useDriveAlbums('drive'));
}

export function useSmartFolder(albumId: string | null): SmartFolder | null {
  const folders = useSmartFolders();
  return folders.find((folder) => folder.id === albumId) ?? null;
}

export function useSmartStats(folder: SmartFolder): SmartStats {
  const window = windowOf(useDriveAlbumItems(folder.id));
  const timeZone = useSettings().time_zone;
  const today = localDayKey(useMinute(), timeZone);
  return smartStatsOf({ ...window, today, timeZone });
}

class SmartDraftIncompleteError extends Error {
  override readonly name = 'SmartDraftIncompleteError';
}

export async function createSmartFolder(draft: SmartDraft): Promise<DriveAlbum> {
  const body = createBody(draft);
  if (body === null) throw new SmartDraftIncompleteError('The smart folder needs a name and rules');
  const made = await createDriveAlbum(body);
  log.info('smart_folder.created', { albumId: made.id, rules: draft.chips.length });
  return made;
}

export async function renameSmartFolder(
  folder: SmartFolder,
  draft: SmartDraft,
): Promise<DriveAlbum> {
  const body = renameBody(draft);
  if (body === null) throw new SmartDraftIncompleteError('The smart folder needs a name');
  const saved = await updateDriveAlbum(folder.id, body);
  log.info('smart_folder.renamed', { albumId: folder.id });
  return saved;
}

export function removeQuestionOf(title: string): Parameters<typeof confirm>[0] {
  return {
    title: `Remove ${title}?`,
    body: 'Only the smart folder goes. The files in it stay where they are.',
    confirmLabel: 'Remove smart folder',
    cancelLabel: 'Keep it',
    tone: 'destructive',
  };
}

export async function removeSmartFolder(folder: SmartFolder): Promise<boolean> {
  const accepted = await confirm(removeQuestionOf(folder.title));
  if (!accepted) return false;
  await removeDriveAlbum(folder.id);
  log.info('smart_folder.removed', { albumId: folder.id });
  return true;
}
