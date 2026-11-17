import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import {
  DRIVE_FOLDER_TREE_BACKFILL,
  DRIVE_ROOT_TOTALS_BACKFILL,
} from '../../src/store/migrations/drive-folder-tree';
import {
  DriveItemsRepository,
  type DriveItemDraft,
} from '../../src/store/repositories/drive-items';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { drivePathOf, sharedDriveRoot } from './drive-roots-fixture';

const NOW = '2026-11-17T00:00:00.000Z';
const ROOT = '0d000000-0000-4000-8000-000000000001';

let database: DatabaseSync;
let items: DriveItemsRepository;
let roots: DriveRootsRepository;
let context: StoreContext;
let rootChanges: { readonly items: number; readonly bytes: number }[];

function itemId(index: number): string {
  return `0e000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

type Common = Omit<Extract<DriveItemDraft, { kind: 'folder' }>, 'kind' | 'childCount' | 'bytes'>;

function common(index: number, relPath: string, parent: number | null): Common {
  return {
    id: itemId(index),
    rootId: ROOT,
    parentId: parent === null ? null : itemId(parent),
    relPath,
    name: relPath.slice(relPath.lastIndexOf('/') + 1),
    modifiedAt: NOW,
    addedAt: NOW,
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
  };
}

function folder(index: number, relPath: string, parent: number | null): DriveItemDraft {
  return { ...common(index, relPath, parent), kind: 'folder', childCount: 0, bytes: 0 };
}

function file(index: number, relPath: string, parent: number, bytes: number): DriveItemDraft {
  return {
    ...common(index, relPath, parent),
    kind: 'image',
    mime: 'image/jpeg',
    bytes,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    takenAt: null,
    width: null,
    height: null,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
  };
}

function put(draft: DriveItemDraft): void {
  items.write({ item: draft, identity: { dev: '7', ino: draft.id } });
}

function totals(index: number): { readonly bytes: number; readonly files: number } {
  const item = items.byId(itemId(index), null);
  if (item.kind !== 'folder') throw new Error(`item ${String(index)} is not a folder`);
  return { bytes: item.totalBytes, files: item.totalFiles };
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const feed = new ChangeFeed(log);
  context = new StoreContext(new Sql(database), feed, () => new Date(NOW));
  migrate(context.sql, MIGRATIONS, NOW, log);
  roots = new DriveRootsRepository(context, drivePathOf);
  roots.insert(sharedDriveRoot(ROOT));
  items = new DriveItemsRepository(context);
  rootChanges = [];
  feed.subscribe((change) => {
    if (change.table === 'drive_roots' && change.record !== null) {
      rootChanges.push({ items: change.record.items, bytes: change.record.bytes });
    }
  });
  put(folder(1, 'Photos', null));
  put(folder(2, 'Photos/2024', 1));
  put(folder(3, 'Photos/2024/Trip', 2));
  put(folder(4, 'Photos/2025', 1));
});

afterEach(() => {
  database.close();
});

describe('recursive folder totals', () => {
  it('counts every file below a folder, not only its direct children', () => {
    put(file(10, 'Photos/2024/Trip/a.jpg', 3, 100));
    put(file(11, 'Photos/2024/b.jpg', 2, 50));
    expect(totals(1)).toEqual({ bytes: 150, files: 2 });
    expect(totals(2)).toEqual({ bytes: 150, files: 2 });
    expect(totals(3)).toEqual({ bytes: 100, files: 1 });
    expect(totals(4)).toEqual({ bytes: 0, files: 0 });
  });

  it('keeps totals right through interleaved uploads into several subfolders', () => {
    for (let index = 0; index < 30; index += 1) {
      const parent = 2 + (index % 3);
      put(file(100 + index, `Photos/f${String(index)}.jpg`, parent, index + 1));
    }
    expect(totals(1)).toEqual({ bytes: 465, files: 30 });
    expect(totals(2).files + totals(4).files).toBe(30);
  });

  it('subtracts deleted files and whole deleted subtrees', () => {
    put(file(10, 'Photos/2024/Trip/a.jpg', 3, 100));
    put(file(11, 'Photos/2025/b.jpg', 4, 40));
    items.remove(itemId(10));
    expect(totals(1)).toEqual({ bytes: 40, files: 1 });
    put(file(12, 'Photos/2024/Trip/c.jpg', 3, 7));
    items.remove(itemId(2));
    expect(totals(1)).toEqual({ bytes: 40, files: 1 });
  });

  it('moves totals with a moved file, a moved folder and a resized file', () => {
    put(file(10, 'Photos/2024/Trip/a.jpg', 3, 100));
    put(file(10, 'Photos/2025/a.jpg', 4, 100));
    expect(totals(3)).toEqual({ bytes: 0, files: 0 });
    expect(totals(4)).toEqual({ bytes: 100, files: 1 });
    put(folder(4, 'Photos/2024/2025', 2));
    expect(totals(2)).toEqual({ bytes: 100, files: 1 });
    expect(totals(1)).toEqual({ bytes: 100, files: 1 });
    put(file(10, 'Photos/2024/2025/a.jpg', 4, 250));
    expect(totals(1)).toEqual({ bytes: 250, files: 1 });
  });

  it('names a folder and every folder above it for live change notices', () => {
    expect(items.folderChainOf(itemId(3))).toEqual([itemId(3), itemId(2), itemId(1)]);
  });

  it('backfills existing folders once in the migration', () => {
    put(file(10, 'Photos/2024/Trip/a.jpg', 3, 100));
    put(file(11, 'Photos/2025/b.jpg', 4, 40));
    database.exec('update drive_items set tree_bytes = 0, tree_files = 0');
    database.exec(DRIVE_FOLDER_TREE_BACKFILL);
    expect(totals(1)).toEqual({ bytes: 140, files: 2 });
    expect(totals(2)).toEqual({ bytes: 100, files: 1 });
  });
});

function driveTotals(): {
  readonly items: number;
  readonly folders: number;
  readonly bytes: number;
} {
  const { items: files, folders, bytes } = roots.byId(ROOT);
  return { items: files, folders, bytes };
}

describe('live drive totals', () => {
  it('counts every file, folder and byte of the drive as items change', () => {
    put(file(10, 'Photos/2024/Trip/a.jpg', 3, 100));
    put(file(11, 'Photos/2025/b.jpg', 4, 40));
    expect(driveTotals()).toEqual({ items: 2, folders: 4, bytes: 140 });
    put(file(11, 'Photos/2025/b.jpg', 4, 60));
    expect(driveTotals()).toEqual({ items: 2, folders: 4, bytes: 160 });
    items.remove(itemId(2));
    expect(driveTotals()).toEqual({ items: 1, folders: 2, bytes: 60 });
  });

  it('matches the root folders totals', () => {
    put(file(10, 'Photos/2024/Trip/a.jpg', 3, 100));
    put(file(11, 'Photos/2025/b.jpg', 4, 40));
    const top = totals(1);
    expect(driveTotals()).toMatchObject({ items: top.files, bytes: top.bytes });
  });

  it('announces one drive change per transaction with the new totals', () => {
    rootChanges.length = 0;
    context.write(() => {
      for (let index = 0; index < 20; index += 1) {
        put(file(100 + index, `Photos/f${String(index)}.jpg`, 2, 5));
      }
    });
    expect(rootChanges).toEqual([{ items: 20, bytes: 100 }]);
    put(folder(5, 'Photos/2026', 1));
    expect(rootChanges.at(-1)).toEqual({ items: 20, bytes: 100 });
    expect(rootChanges).toHaveLength(2);
  });

  it('stays silent when a write leaves the totals unchanged', () => {
    put(file(10, 'Photos/2024/Trip/a.jpg', 3, 100));
    rootChanges.length = 0;
    put(file(10, 'Photos/2024/a.jpg', 2, 100));
    expect(rootChanges).toEqual([]);
  });

  it('backfills the drive totals once in the migration', () => {
    put(file(10, 'Photos/2024/Trip/a.jpg', 3, 100));
    database.exec('update drive_roots set items = 7, folders = 7, bytes = 7');
    for (const statement of DRIVE_ROOT_TOTALS_BACKFILL) database.exec(statement);
    expect(driveTotals()).toEqual({ items: 1, folders: 4, bytes: 100 });
  });
});
