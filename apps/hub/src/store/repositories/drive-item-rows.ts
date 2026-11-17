import { DRIVE_ITEM, DRIVE_ITEM_KINDS } from '@smarteverything/domain';
import { z } from 'zod';
import { lockedSql } from '../../drive/access';
import { builtRow } from '../codec';
import { folderColourOf } from './drive-folder-colours';
import { ICON_HINT, OPEN_COMMENTS, SHARED } from './drive-item-sql';
import type { DriveItemEntry } from './drive-items';
import { openedAtBy } from './drive-opens';
import { starredBy } from './drive-stars';

const COLUMNS = `id, root_id, parent_id, inode_id, rel_path, name, kind, mime, bytes, child_count, sha256,
  integrity, dev, ino, modified_at, added_at, rev, etag, outside,
  added_by_profile_id, remote_id, remote_rev, thumb_state, thumb_reason, taken_at, width, height,
  orientation, camera_make, camera_model, camera_lens, exposure_iso, exposure_aperture,
  exposure_shutter, exposure_focal, place_lat, place_lon, duration_ms, tree_bytes, tree_files`;

export const SELECT = `select ${COLUMNS}, ${openedAtBy('$viewer')} as opened_at,
  ${starredBy('$viewer')} as starred, ${SHARED} as shared, ${lockedSql('i')} as locked,
  exists (select 1 from drive_item_locks h where h.item_id = i.id) as locked_here,
  ${OPEN_COMMENTS} as open_comments,
  ${folderColourOf('$viewer')} as colour,
  ${ICON_HINT} as icon_hint,
  (select n.link_target from drive_inodes n where n.id = i.inode_id) as link_target
  from drive_items i`;

const TEXT = z.string().nullable();

const ITEM_PLACE = z.object({ inode_id: z.number(), dev: TEXT, ino: TEXT });

type ItemColumns = Readonly<Record<string, unknown>>;

function baseOf(row: ItemColumns): Record<string, unknown> {
  return {
    id: row['id'],
    rootId: row['root_id'],
    parentId: row['parent_id'],
    relPath: row['rel_path'],
    name: row['name'],
    kind: row['kind'],
    modifiedAt: row['modified_at'],
    addedAt: row['added_at'],
    openedAt: row['opened_at'],
    starred: row['starred'],
    shared: row['shared'],
    locked: row['locked'],
    lockedHere: row['locked_here'],
    openComments: row['open_comments'],
    rev: row['rev'],
    etag: row['etag'],
    outside: row['outside'],
    addedByProfileId: row['added_by_profile_id'],
    remoteId: row['remote_id'],
    remoteRev: row['remote_rev'],
  };
}

function thumbOf(row: ItemColumns): Record<string, unknown> {
  return row['thumb_reason'] === null
    ? { state: row['thumb_state'] }
    : { state: row['thumb_state'], reason: row['thumb_reason'] };
}

function fileOf(row: ItemColumns): Record<string, unknown> {
  return {
    mime: row['mime'],
    bytes: row['bytes'],
    sha256: row['sha256'],
    integrity: row['integrity'],
    thumb: thumbOf(row),
  };
}

function allNull(values: readonly unknown[]): boolean {
  return values.every((value) => value === null);
}

function mediaOf(row: ItemColumns): Record<string, unknown> {
  const camera = [row['camera_make'], row['camera_model'], row['camera_lens']];
  const exposure = [
    row['exposure_iso'],
    row['exposure_aperture'],
    row['exposure_shutter'],
    row['exposure_focal'],
  ];
  return {
    takenAt: row['taken_at'],
    width: row['width'],
    height: row['height'],
    orientation: row['orientation'],
    camera: allNull(camera)
      ? null
      : { make: row['camera_make'], model: row['camera_model'], lens: row['camera_lens'] },
    exposure: allNull(exposure)
      ? null
      : {
          iso: row['exposure_iso'],
          aperture: row['exposure_aperture'],
          shutter: row['exposure_shutter'],
          focal: row['exposure_focal'],
        },
    place:
      row['place_lat'] === null || row['place_lon'] === null
        ? null
        : { lat: row['place_lat'], lon: row['place_lon'] },
  };
}

function kindFieldsOf(row: ItemColumns): Record<string, unknown> {
  switch (z.enum(DRIVE_ITEM_KINDS).parse(row['kind'])) {
    case 'folder':
      return {
        childCount: row['child_count'],
        bytes: row['bytes'],
        totalBytes: row['tree_bytes'],
        totalFiles: row['tree_files'],
        colour: row['colour'],
        iconHint: row['icon_hint'],
      };
    case 'image':
      return { ...fileOf(row), ...mediaOf(row) };
    case 'video':
      return { ...fileOf(row), ...mediaOf(row), durationMs: row['duration_ms'] };
    case 'audio':
      return { ...fileOf(row), takenAt: row['taken_at'], durationMs: row['duration_ms'] };
    case 'document':
    case 'other':
      return fileOf(row);
    case 'link':
      return { bytes: row['bytes'], linkTarget: row['link_target'] };
    case 'special':
      return { bytes: row['bytes'] };
  }
}

function storedItemOf(row: ItemColumns): DriveItemEntry {
  const place = ITEM_PLACE.parse(row);
  return {
    item: DRIVE_ITEM.parse({ ...baseOf(row), ...kindFieldsOf(row) }),
    identity: place.dev === null || place.ino === null ? null : { dev: place.dev, ino: place.ino },
    inodeId: place.inode_id,
  };
}

export const STORED_ITEM = builtRow(storedItemOf, {
  flags: ['starred', 'shared', 'locked', 'locked_here', 'icon_hint', 'outside'],
});
