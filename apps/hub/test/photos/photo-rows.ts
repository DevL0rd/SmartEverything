import type { DatabaseSync } from 'node:sqlite';

const NOW = '2026-11-07T00:00:00.000Z';

export function insertDriveRow(
  database: DatabaseSync,
  drive: {
    readonly id: string;
    readonly scope: string;
    readonly ownerId: string | null;
  },
): void {
  database
    .prepare(
      `insert into drive_roots (id, scope, owner_profile_id, versions, index_id, state, items,
        folders, bytes, hashed_share, verified_share, corrupt, skip_patterns, include_hidden,
        created_at, updated_at)
        values (?, ?, ?, 1, 'index-1', 'ready', 0, 0, 0, 0, 0, 0, '[]', 0, ?, ?)`,
    )
    .run(drive.id, drive.scope, drive.ownerId, NOW, NOW);
}

export function recordLibraryRow(
  database: DatabaseSync,
  item: {
    readonly id: string;
    readonly rootId: string;
    readonly kind: string;
    readonly starred: boolean;
    readonly inLibrary: boolean;
  },
): void {
  if (item.inLibrary && (item.kind === 'image' || item.kind === 'video')) {
    database
      .prepare('insert into drive_photo_library (item_id, root_id) values (?, ?)')
      .run(item.id, item.rootId);
  }
  if (!item.starred) return;
  const drive = database
    .prepare('select scope, owner_profile_id as owner from drive_roots where id = ?')
    .get(item.rootId);
  const profiles =
    drive?.['scope'] === 'home'
      ? database.prepare('select id from profiles').all()
      : [{ id: drive?.['owner'] }];
  for (const profile of profiles) {
    database
      .prepare('insert or ignore into drive_stars (profile_id, item_id) values (?, ?)')
      .run(String(profile.id), item.id);
  }
}
