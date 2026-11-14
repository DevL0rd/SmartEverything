import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { HubLayout } from '../data-layout';
import { DrivePathError } from '../drive/paths';
import { MARKER_FILE, RootMarkerError, readRootMarker } from '../drive/root-marker';
import type { Sql } from '../store/sql';

const UNLINKED = z.strictObject({
  root_id: z.string(),
  path: z.string(),
  read_only: z.number(),
});

const REMAINING = z.strictObject({ remaining: z.number() });

const DRIVE_META_FOLDERS = ['system/drive-meta', 'drive-meta'] as const;

export class UnlinkedFoldersLeftError extends Error {
  override readonly name = 'UnlinkedFoldersLeftError';

  constructor(readonly remaining: number) {
    super(`${String(remaining)} unlinked drive folders are still recorded after preparation.`);
  }
}

async function releaseMarker(path: string, rootId: string): Promise<boolean> {
  try {
    const marker = await readRootMarker(path);
    if (marker.id !== rootId) return false;
    await rm(join(path, MARKER_FILE), { force: true });
    return true;
  } catch (cause) {
    if (cause instanceof DrivePathError && cause.failure === 'missing') return false;
    if (cause instanceof RootMarkerError) return false;
    throw cause;
  }
}

async function dropRecords(layout: Pick<HubLayout, 'root'>, rootId: string): Promise<void> {
  for (const folder of DRIVE_META_FOLDERS) {
    await rm(join(layout.root, folder, rootId), { recursive: true, force: true });
  }
}

export async function removeUnlinkedFolders(
  sql: Sql,
  layout: Pick<HubLayout, 'root'>,
  log: Logger,
): Promise<void> {
  const rows = sql.all(UNLINKED, 'select root_id, path, read_only from drive_unlinked_folders');
  for (const row of rows) {
    const released = row.read_only === 1 ? false : await releaseMarker(row.path, row.root_id);
    await dropRecords(layout, row.root_id);
    sql.run(
      'forget the unlinked folder',
      'delete from drive_unlinked_folders where root_id = $id',
      {
        id: row.root_id,
      },
    );
    log.info('service.unlinked_folder_released', {
      rootId: row.root_id,
      readOnly: row.read_only === 1,
      markerRemoved: released,
    });
  }
  const left = sql.get(REMAINING, 'select count(*) as remaining from drive_unlinked_folders');
  if (left !== undefined && left.remaining > 0) throw new UnlinkedFoldersLeftError(left.remaining);
}
