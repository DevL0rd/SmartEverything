import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { fsCode } from '../../../fs-code';
import type { DriveFolderIcon } from '../../../store/repositories/drive-folder-icons';
import type { StoredDrive } from '../../../store/repositories/drive-roots';
import type { Store } from '../../../store/store';
import { detectFolderIcon, modifiedMsOf } from './detect';

const WINDOW_ROWS = 1000;

type Folder = Extract<DriveItem, { readonly kind: 'folder' }>;

export interface FolderIconEnvironment {
  readonly store: Pick<Store, 'driveItems' | 'driveFolderIcons' | 'driveFeed' | 'feed'>;
  readonly derivedDirectory: (itemId: string) => string;
  readonly log: Logger;
}

export function folderIconFile(
  env: Pick<FolderIconEnvironment, 'derivedDirectory'>,
  folderId: string,
  sha256: string,
): string {
  return join(env.derivedDirectory(folderId), `${folderId}-icon-${sha256}.png`);
}

async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true });
}

async function writeIcon(path: string, png: Buffer): Promise<void> {
  try {
    await stat(path);
    return;
  } catch (cause) {
    if (fsCode(cause) !== 'ENOENT') throw cause;
  }
  await mkdir(dirname(path), { recursive: true });
  const staged = `${path}.${String(process.pid)}.partial`;
  try {
    await writeFile(staged, png);
    await rename(staged, path);
  } catch (cause) {
    await removeFile(staged);
    throw cause;
  }
}

export class FolderIconRefresher {
  private readonly checked = new Map<string, string>();

  constructor(private readonly env: FolderIconEnvironment) {}

  async refreshRoot(root: StoredDrive, signal: AbortSignal): Promise<void> {
    const pending: (string | null)[] = [null];
    for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
      let after: string | null = null;
      do {
        const window = this.env.store.driveItems.children({
          rootId: root.id,
          parentId: parent,
          after,
          limit: WINDOW_ROWS,
          viewer: null,
        });
        for (const { item } of window.entries) {
          if (item.kind !== 'folder') continue;
          pending.push(item.id);
          if (signal.aborted) return;
          await this.refreshFolder(root, item);
        }
        after = window.next;
      } while (after !== null);
    }
  }

  async refreshFolder(root: StoredDrive, folder: Folder): Promise<void> {
    const existing = this.env.store.driveFolderIcons.find(folder.id);
    if (
      this.checked.get(folder.id) === folder.modifiedAt &&
      (await this.unchanged(root, existing))
    ) {
      return;
    }
    const found = await detectFolderIcon(root.path, folder.relPath);
    if (found === null) {
      this.checked.set(folder.id, folder.modifiedAt);
      if (existing !== undefined) await this.clear(root, folder, existing);
      return;
    }
    await writeIcon(folderIconFile(this.env, folder.id, found.sha256), found.png);
    const changed = this.env.store.driveFolderIcons.set({
      folderItemId: folder.id,
      source: found.source,
      sourceRelPath: found.relPath,
      sourceRev: found.modifiedMs,
      imageSha256: found.sha256,
    });
    this.checked.set(folder.id, folder.modifiedAt);
    if (existing !== undefined && existing.imageSha256 !== found.sha256) {
      await removeFile(folderIconFile(this.env, folder.id, existing.imageSha256));
    }
    if (changed) this.announce(root, folder);
  }

  private async unchanged(
    root: StoredDrive,
    existing: DriveFolderIcon | undefined,
  ): Promise<boolean> {
    if (existing === undefined) return true;
    return (await modifiedMsOf(root.path, existing.sourceRelPath)) === existing.sourceRev;
  }

  private async clear(root: StoredDrive, folder: Folder, existing: DriveFolderIcon): Promise<void> {
    this.env.store.driveFolderIcons.clear(folder.id);
    await removeFile(folderIconFile(this.env, folder.id, existing.imageSha256));
    this.announce(root, folder);
  }

  private announce(root: StoredDrive, folder: Folder): void {
    this.env.store.feed.notice({
      type: 'drive_changed',
      rootIds: [root.id],
      folderIds: folder.parentId === null ? [] : [folder.parentId],
      albumIds: [],
      months: [],
      cursor: this.env.store.driveFeed.latestSeq(),
    });
  }
}
