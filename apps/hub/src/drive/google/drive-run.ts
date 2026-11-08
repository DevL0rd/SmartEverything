import { safeName } from './destination';
import { downloadOf, filePage, loadFolderTree } from './drive-source';
import type { DriveFile } from './schemas';
import { DRIVE_FOLDER } from './scopes';
import { transferItem, type Fetched, type RunContext } from './transfer';
import type { FolderTree } from './drive-source';

async function copyFile(context: RunContext, tree: FolderTree, file: DriveFile): Promise<Fetched> {
  const download = downloadOf(file);
  if (download === null) {
    return { kind: 'skipped', reason: file.mimeType };
  }
  return context.destination.place({
    segments: [DRIVE_FOLDER, ...tree.pathOf(file.parents).map((name) => safeName(name, 'Folder'))],
    name: safeName(download.name, 'File'),
    modifiedAt: new Date(file.modifiedTime),
    source: await context.http.bytes(download.url),
  });
}

export async function runDrive(context: RunContext, start: string | null): Promise<void> {
  const tree = await loadFolderTree(context.http);
  let cursor = start;
  do {
    const page = await filePage(context.http, cursor);
    for (const file of page.files) {
      await transferItem(context, 'drive', file.id, () => copyFile(context, tree, file));
    }
    cursor = page.next;
    context.changed(context.ledger.update(context.importId, { driveCursor: cursor }));
  } while (cursor !== null);
}
