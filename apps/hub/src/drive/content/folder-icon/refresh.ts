import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { fsCode } from '../../../fs-code';
import type {
  DriveFolderIcon,
  DriveFolderIconInput,
} from '../../../store/repositories/drive-folder-icons';
import type { DriveChildrenQuery, DriveItemWindow } from '../../../store/repositories/drive-items';
import type { StoredDrive } from '../../../store/repositories/drive-roots';
import type { Store } from '../../../store/store';
import { detectFolderIcon, modifiedMsOf } from './detect';

const WINDOW_ROWS = 1000;

type Folder = Extract<DriveItem, { readonly kind: 'folder' }>;

export interface FolderIconStore {
  readonly children: (query: DriveChildrenQuery) => Promise<DriveItemWindow>;
  readonly find: (folderItemId: string) => Promise<DriveFolderIcon | undefined>;
  readonly set: (input: DriveFolderIconInput) => Promise<boolean>;
  readonly clear: (folderItemId: string) => Promise<boolean>;
  readonly latestSeq: () => Promise<number>;
}

export interface FolderIconEnvironment {
  readonly icons: FolderIconStore;
  readonly feed: Pick<Store['feed'], 'notice'>;
  readonly derivedDirectory: (itemId: string) => string;
  readonly log: Logger;
}

export function hostFolderIcons(store: Pick<Store, 'host'>): FolderIconStore {
  const { host } = store;
  return {
    children: (query) => host.call('driveItems', 'children', query),
    find: (folderItemId) => host.call('driveFolderIcons', 'find', folderItemId),
    set: (input) => host.call('driveFolderIcons', 'set', input),
    clear: (folderItemId) => host.call('driveFolderIcons', 'clear', folderItemId),
    latestSeq: () => host.call('driveFeed', 'latestSeq'),
  };
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
        const window = await this.env.icons.children({
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
    const existing = await this.env.icons.find(folder.id);
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
    const changed = await this.env.icons.set({
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
    if (changed) await this.announce(root, folder);
  }

  private async unchanged(
    root: StoredDrive,
    existing: DriveFolderIcon | undefined,
  ): Promise<boolean> {
    if (existing === undefined) return true;
    return (await modifiedMsOf(root.path, existing.sourceRelPath)) === existing.sourceRev;
  }

  private async clear(root: StoredDrive, folder: Folder, existing: DriveFolderIcon): Promise<void> {
    await this.env.icons.clear(folder.id);
    await removeFile(folderIconFile(this.env, folder.id, existing.imageSha256));
    await this.announce(root, folder);
  }

  private async announce(root: StoredDrive, folder: Folder): Promise<void> {
    const cursor = await this.env.icons.latestSeq();
    this.env.feed.notice({
      type: 'drive_changed',
      rootIds: [root.id],
      folderIds: folder.parentId === null ? [] : [folder.parentId],
      albumIds: [],
      months: [],
      cursor,
    });
  }
}
