import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { removeDriveAlbum, updateDriveAlbum } from '../../../api/drive';
import { confirm } from '../../../components/confirm-store';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import { useSettings } from '../../../store/selectors';
import { flattenPages, useDriveAlbumItems, useDriveAlbums } from '../data';
import { createAlbumShown } from '../data/album-create';
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

export interface StartedSmartFolder {
  readonly id: string;
  readonly title: string;
  readonly saved: Promise<DriveAlbum>;
}

export function startSmartFolder(
  store: EntityStore,
  client: QueryClient,
  draft: SmartDraft,
): StartedSmartFolder {
  const body = createBody(draft);
  if (body === null) throw new SmartDraftIncompleteError('The smart folder needs a name and rules');
  const id = randomUUID();
  const saved = createAlbumShown(store, client, { ...body, id }).then((made) => {
    log.info('smart_folder.created', { albumId: made.id, rules: draft.chips.length });
    return made;
  });
  return { id, title: body.title, saved };
}

function albumOf(store: EntityStore, folder: SmartFolder): DriveAlbum | null {
  return store.get().tables.drive_albums.byId[folder.id] ?? null;
}

export function renameSmartFolder(
  store: EntityStore,
  folder: SmartFolder,
  draft: SmartDraft,
): Promise<DriveAlbum> {
  const body = renameBody(draft);
  if (body === null)
    return Promise.reject(new SmartDraftIncompleteError('The smart folder needs a name'));
  const previous = albumOf(store, folder);
  return writeOptimistically(store, {
    event: 'smart_folder.rename',
    edits:
      previous === null || body.title === undefined
        ? []
        : [liveRowEdit('drive_albums', folder.id, previous, { ...previous, title: body.title })],
    send: () => updateDriveAlbum(folder.id, body),
    fields: { albumId: folder.id },
  });
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

export async function removeSmartFolder(
  store: EntityStore,
  folder: SmartFolder,
  onRemoved: () => void,
): Promise<void> {
  const accepted = await confirm(removeQuestionOf(folder.title));
  if (!accepted) return;
  onRemoved();
  const previous = albumOf(store, folder);
  await writeOptimistically(store, {
    event: 'smart_folder.remove',
    edits: previous === null ? [] : [liveRowEdit('drive_albums', folder.id, previous, null)],
    send: () => removeDriveAlbum(folder.id),
    fields: { albumId: folder.id },
  });
}
