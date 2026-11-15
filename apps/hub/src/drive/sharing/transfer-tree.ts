import type { DriveItem, DriveVersion } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { DRIVE_PAGE_SIZE } from '../service-read';

export interface Tree {
  readonly items: readonly DriveItem[];
  readonly folderIds: readonly string[];
  readonly shas: readonly string[];
  readonly bytes: number;
}

type TreeStore = Pick<Store, 'driveItems' | 'driveVersions'>;

function childrenOf(store: TreeStore, folder: DriveItem): DriveItem[] {
  const children: DriveItem[] = [];
  let after: string | null = null;
  do {
    const window = store.driveItems.children({
      rootId: folder.rootId,
      parentId: folder.id,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: null,
    });
    children.push(...window.entries.map((entry) => entry.item));
    after = window.next;
  } while (after !== null);
  return children;
}

function versionsOf(store: TreeStore, file: DriveItem): DriveVersion[] {
  const versions: DriveVersion[] = [];
  let before: number | null = null;
  do {
    const window = store.driveVersions.forItem(file.id, before, DRIVE_PAGE_SIZE);
    versions.push(...window.versions);
    before = window.next;
  } while (before !== null);
  return versions;
}

export function collectTree(store: TreeStore, top: DriveItem): Tree {
  const items: DriveItem[] = [top];
  const shas = new Set<string>();
  let bytes = 0;
  for (const item of items) {
    if (item.kind === 'folder') {
      items.push(...childrenOf(store, item));
      continue;
    }
    bytes += item.bytes;
    for (const version of versionsOf(store, item)) {
      shas.add(version.sha256);
      bytes += version.bytes;
    }
  }
  return {
    items,
    folderIds: items.filter((item) => item.kind === 'folder').map((item) => item.id),
    shas: [...shas],
    bytes,
  };
}
