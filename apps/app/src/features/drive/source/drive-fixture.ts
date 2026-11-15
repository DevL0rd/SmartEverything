import type {
  DriveChange,
  DriveChangeResult,
  DriveItem,
  DriveFolderPlace,
  DriveRoot,
  DriveShortcut,
  DriveShortcutChange,
  DriveShortcutCreate,
  DriveTrashEntry,
} from '@smarteverything/domain';
import {
  AT,
  OWNER_ID,
  ROOT_ID,
  OTHER_ROOT_ID,
  documentFixture,
  driveItemFixture,
  folderFixture,
  imageFixture,
  personalRootRow,
  rootRow,
} from '../data/fixtures';
import type { DriveNodeContext, TrashRights } from './drive-node';
import type { DriveOpsEnv } from './drive-ops';

export const MINE: DriveRoot = personalRootRow(ROOT_ID, OWNER_ID);

export const HOME: DriveRoot = rootRow(OTHER_ROOT_ID, 'ready');

export const VIEWER_ID = OWNER_ID;

export const OWNER_RIGHTS: TrashRights = { owner: true, viewerId: VIEWER_ID, roots: [MINE, HOME] };

export function idOf(number: number): string {
  return `a1b2c3d4-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

export function worldContext(patch: Partial<DriveNodeContext> = {}): DriveNodeContext {
  return {
    roots: [MINE, HOME],
    viewerId: VIEWER_ID,
    shared: [],
    offline: new Map(),
    placements: new Map(),
    ...patch,
  };
}

export function seedItems(): readonly DriveItem[] {
  return [
    folderFixture({ id: idOf(1), name: 'Docs', parentId: null, relPath: 'Docs' }),
    folderFixture({ id: idOf(2), name: 'Photos', parentId: null, relPath: 'Photos' }),
    documentFixture({
      id: idOf(3),
      name: 'Plan.pdf',
      parentId: null,
      relPath: 'Plan.pdf',
      bytes: 2048,
    }),
    imageFixture({
      id: idOf(4),
      name: 'Beach.jpg',
      parentId: null,
      relPath: 'Beach.jpg',
      bytes: 4096,
    }),
    documentFixture({
      id: idOf(5),
      name: 'Notes.txt',
      mime: 'text/plain',
      parentId: idOf(1),
      relPath: 'Docs/Notes.txt',
    }),
  ];
}

type Change<A extends DriveChange['action']> = Extract<DriveChange, { readonly action: A }>;

type Done = DriveChangeResult['done'][number];

type Failed = DriveChangeResult['failed'][number];

interface Made {
  readonly made: string;
}

function madeOf(result: unknown): string | null {
  return typeof result === 'object' && result !== null && 'made' in result
    ? String(result.made)
    : null;
}

type Supported = Exclude<
  DriveChange,
  { readonly action: 'album_add' | 'album_remove' | 'keep_source_item' }
>;

function supported(body: DriveChange): body is Supported {
  return !body.action.startsWith('album_') && body.action !== 'keep_source_item';
}

const NOT_HERE: DriveChangeResult = {
  done: [],
  failed: [{ itemId: null, reason: 'Not supported here.' }],
  conflicts: [],
};

export class FakeDrive {
  readonly items: Map<string, DriveItem>;
  readonly trashed = new Map<string, DriveItem>();
  readonly calls: DriveChange[] = [];
  readonly shortcuts = new Map<string, DriveShortcut>();
  readonly opened: string[] = [];
  readonly env: DriveOpsEnv;
  private next = 100;

  constructor(seed: readonly DriveItem[]) {
    this.items = new Map(seed.map((item) => [item.id, item]));
    this.env = {
      change: (body): Promise<DriveChangeResult> => Promise.resolve(this.change(body)),
      shortcuts: {
        update: (id, body): Promise<DriveShortcut> =>
          Promise.resolve(this.updateShortcut(id, body)),
        remove: (id): Promise<null> => {
          this.shortcuts.delete(id);
          return Promise.resolve(null);
        },
        create: (body): Promise<DriveShortcut> => Promise.resolve(this.createShortcut(body)),
      },
      roots: [MINE, HOME],
      viewerId: VIEWER_ID,
      restore: {
        readItem: (itemId): Promise<DriveItem> => {
          const item = this.items.get(itemId);
          return item === undefined
            ? Promise.reject(new Error('It is not there.'))
            : Promise.resolve(item);
        },
        labelOf: (): string => 'My Drive',
        open: (item): void => {
          this.opened.push(item.id);
        },
      },
    };
  }

  addShortcut(shortcut: DriveShortcut): void {
    this.shortcuts.set(shortcut.id, shortcut);
  }

  private updateShortcut(id: string, body: DriveShortcutChange): DriveShortcut {
    const shortcut = this.shortcuts.get(id);
    if (shortcut === undefined) throw new Error('There is no such shortcut.');
    const changed = {
      ...shortcut,
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.place === undefined ? {} : placedOf(body.place)),
    };
    this.shortcuts.set(id, changed);
    return changed;
  }

  private createShortcut(body: DriveShortcutCreate): DriveShortcut {
    const item = this.items.get(body.targetItemId);
    if (item === undefined) throw new Error('There is no such item.');
    const made: DriveShortcut = {
      id: this.nextId(),
      ...placedOf(body.place),
      name: body.name,
      createdBy: VIEWER_ID,
      createdAt: AT,
      target: { state: 'available', item },
    };
    this.shortcuts.set(made.id, made);
    return made;
  }

  childrenOf(parentId: string | null): readonly DriveItem[] {
    return [...this.items.values()].filter(
      (item) => item.parentId === parentId && item.rootId === ROOT_ID,
    );
  }

  trashEntries(): readonly DriveTrashEntry[] {
    return [...this.trashed.values()].map((item) => ({
      itemId: item.id,
      rootId: item.rootId,
      name: item.name,
      originalRelPath: item.relPath,
      trashRelPath: item.relPath,
      isFolder: item.kind === 'folder',
      bytes: 'bytes' in item ? item.bytes : 0,
      deletedAt: AT,
      purgeAt: '2026-12-07T10:00:00.000Z',
      deletedBy: null,
      addedByProfileId: null,
    }));
  }

  change(body: DriveChange): DriveChangeResult {
    this.calls.push(body);
    return supported(body) ? this.apply(body) : NOT_HERE;
  }

  private apply(body: Supported): DriveChangeResult {
    switch (body.action) {
      case 'new_folder':
        return this.newFolder(body);
      case 'rename':
        return this.each([body.itemId], (item) =>
          this.items.set(item.id, { ...item, name: body.name }),
        );
      case 'move':
        return this.each(body.itemIds, (item) =>
          this.items.set(item.id, { ...item, parentId: body.toFolderId }),
        );
      case 'copy':
        return this.each(body.itemIds, (item) => this.copy(item, body.toFolderId));
      case 'trash':
        return this.each(body.itemIds, (item) => {
          this.discard(item);
        });
      case 'restore':
        return this.each(body.itemIds, (item): Made => {
          this.bring(item);
          return { made: item.id };
        });
      case 'delete_now':
        return this.each(body.itemIds, (item) => this.trashed.delete(item.id));
      case 'star':
      case 'unstar':
        return this.each(body.itemIds, (item) =>
          this.items.set(item.id, { ...item, starred: body.action === 'star' }),
        );
    }
  }

  private nextId(): string {
    this.next += 1;
    return idOf(this.next);
  }

  private newFolder(body: Change<'new_folder'>): DriveChangeResult {
    const parentId = body.parent.kind === 'folder' ? body.parent.folderId : null;
    const made = driveItemFixture('folder', {
      id: this.nextId(),
      name: body.name,
      parentId,
      relPath: body.name,
    });
    this.items.set(made.id, made);
    return { done: [{ itemId: made.id, resultItemId: made.id }], failed: [], conflicts: [] };
  }

  private copy(item: DriveItem, toFolderId: string): Made {
    const copy = { ...item, id: this.nextId(), parentId: toFolderId };
    this.items.set(copy.id, copy);
    return { made: copy.id };
  }

  private discard(item: DriveItem): void {
    this.items.delete(item.id);
    this.trashed.set(item.id, item);
  }

  private bring(item: DriveItem): void {
    this.trashed.delete(item.id);
    this.items.set(item.id, item);
  }

  private each(ids: readonly string[], act: (item: DriveItem) => unknown): DriveChangeResult {
    const done: Done[] = [];
    const failed: Failed[] = [];
    for (const id of ids) {
      const item = this.items.get(id) ?? this.trashed.get(id);
      if (item === undefined) {
        failed.push({ itemId: id, reason: 'It is gone.' });
      } else {
        const result = act(item);
        done.push({ itemId: id, resultItemId: madeOf(result) });
      }
    }
    return { done, failed, conflicts: [] };
  }
}

function placedOf(place: DriveFolderPlace): Pick<DriveShortcut, 'rootId' | 'parentId'> {
  return place.kind === 'drive'
    ? { rootId: place.rootId, parentId: null }
    : { rootId: ROOT_ID, parentId: place.folderId };
}

export function createFakeDrive(seed: readonly DriveItem[] = seedItems()): FakeDrive {
  return new FakeDrive(seed);
}
