import { DatabaseSync } from 'node:sqlite';
import type { PhotoBox } from '@smarteverything/domain';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DriveAlbumsRepository } from '../../src/store/repositories/drive-albums';
import { DriveRootsRepository } from '../../src/store/repositories/drive-roots';
import {
  photoRepositories,
  type PhotoRepositories,
} from '../../src/store/repositories/areas/photos';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { driveFolders, personalDriveRoot, sharedDriveRoot } from './drive-roots-fixture';

export const NOW = '2026-11-14T10:00:00.000Z';

export const id = (group: string, index: number): string =>
  `${group}000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

export const SHARED_ROOT = id('0a', 1);
export const ALICE_ROOT = id('0a', 2);
export const BOB_ROOT = id('0a', 3);
export const BOX: PhotoBox = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };

export interface PhotoFixture {
  readonly database: DatabaseSync;
  readonly context: StoreContext;
  readonly repos: PhotoRepositories;
  readonly albums: DriveAlbumsRepository;
  readonly alice: string;
  readonly bob: string;
  readonly cara: string;
}

export function insert(
  database: DatabaseSync,
  table: string,
  fields: Record<string, string | number | null>,
): void {
  const columns = Object.keys(fields);
  database
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(fields));
}

export function photoFixture(): PhotoFixture {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, log);
  const context = new StoreContext(sql, new ChangeFeed(log), () => new Date(NOW));
  const profiles = new ProfilesRepository(context);
  const alice = profiles.create({ name: 'Alice' }).id;
  const bob = profiles.create({ name: 'Bob' }).id;
  const cara = profiles.create({ name: 'Cara' }).id;
  const roots = new DriveRootsRepository(context, driveFolders);
  roots.insert(sharedDriveRoot(SHARED_ROOT));
  roots.insert(personalDriveRoot(ALICE_ROOT, alice));
  roots.insert(personalDriveRoot(BOB_ROOT, bob));
  return {
    database,
    context,
    repos: photoRepositories(context),
    albums: new DriveAlbumsRepository(context),
    alice,
    bob,
    cara,
  };
}

export interface PhotoSeed {
  readonly n: number;
  readonly root: string;
  readonly relPath?: string;
  readonly takenAt?: string;
  readonly inLibrary?: boolean;
}

export function photo(database: DatabaseSync, seed: PhotoSeed): string {
  const itemId = id('0b', seed.n);
  const relPath = seed.relPath ?? `Photos/${String(seed.n)}.jpg`;
  const now = 1_000_000_000;
  const inode = database
    .prepare(
      `insert into drive_inodes (root_id, is_root, type, mode, atime_ns, mtime_ns, ctime_ns, btime_ns, orphan)
       values (?, 0, 'file', 420, ?, ?, ?, ?, 0) returning id`,
    )
    .get(seed.root, now, now, now, now)?.['id'];
  insert(database, 'drive_items', {
    id: itemId,
    inode_id: Number(inode),
    root_id: seed.root,
    parent_id: null,
    rel_path: relPath,
    name: relPath.slice(relPath.lastIndexOf('/') + 1),
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 10,
    integrity: 'unknown',
    modified_at: NOW,
    added_at: NOW,
    rev: 1,
    etag: `etag-${String(seed.n)}`,
    outside: 0,
    thumb_state: 'none',
    taken_at: seed.takenAt ?? '2026-06-01T10:00:00.000Z',
  });
  if (seed.inLibrary === true) {
    insert(database, 'drive_photo_library', { item_id: itemId, root_id: seed.root });
  }
  return itemId;
}

export function face(
  fixture: PhotoFixture,
  itemId: string,
  n: number,
  kind: 'person' | 'pet' = 'person',
): string {
  const faceId = id('0f', n);
  fixture.repos.photoFaces.replaceForItem(itemId, [
    ...fixture.repos.photoFaces.forItem(itemId),
    {
      id: faceId,
      itemId,
      rev: 1,
      kind,
      species: kind === 'pet' ? 'dog' : null,
      box: BOX,
      landmarks: null,
      score: 0.9,
      quality: 0.8,
      model: 'test-model',
      vector: new Uint8Array([1, 2, 3, 4]),
    },
  ]);
  return faceId;
}
