import {
  DRIVE_INTEGRITY,
  DRIVE_ITEM,
  DRIVE_FOLDER_COLOURS,
  DRIVE_ITEM_KINDS,
  type DriveItem,
} from '@smarteverything/domain';
import { z } from 'zod';
import { lockedSql } from '../../drive/access';
import { invalidateDerivedRevision } from './drive-media-revision';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { itemColumns, sameStored } from './drive-item-columns';
import { folderColourOf } from './drive-folder-colours';
import { momentOfNs } from './drive-inodes';
import { DriveInodeError, DriveItemInodes, type DriveInodePatch } from './drive-item-inodes';
import { openedAtBy } from './drive-opens';
import { starredBy } from './drive-stars';
import {
  nextMarkOf,
  sortOrderOf,
  type DriveSortedChildrenQuery,
  type DriveSortedWindow,
} from './drive-item-sort';

export interface DriveItemIdentity {
  readonly dev: string;
  readonly ino: string;
}

type Derived = 'rev' | 'etag' | 'openedAt' | 'locked' | 'lockedHere' | 'openComments' | 'colour';

type Draft<T> = T extends unknown ? Omit<T, Derived | 'iconHint'> : never;

export type DriveItemDraft = Draft<DriveItem>;

export interface DriveItemWrite {
  readonly item: DriveItemDraft;
  readonly identity: DriveItemIdentity;
  readonly inode?: DriveInodePatch;
  readonly shareInode?: number;
}

export interface DriveItemWriteResult {
  readonly item: DriveItem;
  readonly changed: boolean;
}

export interface DriveItemEntry {
  readonly item: DriveItem;
  readonly identity: DriveItemIdentity | null;
  readonly inodeId: number;
}

export interface DriveChildrenQuery {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly after: string | null;
  readonly limit: number;
  readonly viewer: string | null;
}

export interface DriveItemWindow {
  readonly entries: readonly DriveItemEntry[];
  readonly next: string | null;
}

const COLUMNS = `id, root_id, parent_id, inode_id, rel_path, name, kind, mime, bytes, child_count, sha256,
  integrity, dev, ino, modified_at, added_at, rev, etag, outside,
  added_by_profile_id, remote_id, remote_rev, thumb_state, thumb_reason, taken_at, width, height,
  orientation, camera_make, camera_model, camera_lens, exposure_iso, exposure_aperture,
  exposure_shutter, exposure_focal, place_lat, place_lon, duration_ms`;

const SHARED = `(exists (select 1 from drive_grants g where g.item_id = i.id)
  or exists (select 1 from drive_shares s where s.item_id = i.id and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > $now)))`;

const OPEN_COMMENTS = `(select count(*) from drive_comments c
  where c.item_id = i.id and c.parent_id is null and c.resolved_at is null
    and (c.deleted_at is null or exists (select 1 from drive_comments r
      where r.parent_id = c.id and r.deleted_at is null)))`;

const ICON_HINT = 'exists (select 1 from drive_folder_icons f where f.folder_item_id = i.id)';

const SELECT = `select ${COLUMNS}, ${openedAtBy('$viewer')} as opened_at,
  ${starredBy('$viewer')} as starred, ${SHARED} as shared, ${lockedSql('i')} as locked,
  exists (select 1 from drive_item_locks h where h.item_id = i.id) as locked_here,
  ${OPEN_COMMENTS} as open_comments,
  ${folderColourOf('$viewer')} as colour,
  ${ICON_HINT} as icon_hint,
  (select n.link_target from drive_inodes n where n.id = i.inode_id) as link_target
  from drive_items i`;

const TEXT = z.string().nullable();
const NUMBER = z.number().nullable();

const ITEM_COLUMNS = z.strictObject({
  id: z.string(),
  root_id: z.string(),
  parent_id: TEXT,
  inode_id: z.number(),
  rel_path: z.string(),
  name: z.string(),
  kind: z.enum(DRIVE_ITEM_KINDS),
  mime: TEXT,
  bytes: z.number(),
  child_count: NUMBER,
  sha256: TEXT,
  integrity: z.enum(DRIVE_INTEGRITY),
  dev: TEXT,
  ino: TEXT,
  modified_at: z.string(),
  added_at: z.string(),
  opened_at: TEXT,
  starred: z.boolean(),
  shared: z.boolean(),
  locked: z.boolean(),
  locked_here: z.boolean(),
  open_comments: z.number(),
  colour: z.enum(DRIVE_FOLDER_COLOURS).nullable(),
  icon_hint: z.boolean(),
  link_target: TEXT,
  rev: z.number(),
  etag: z.string(),
  outside: z.boolean(),
  added_by_profile_id: TEXT,
  remote_id: TEXT,
  remote_rev: TEXT,
  thumb_state: z.enum(['none', 'ready', 'failed', 'unsupported']),
  thumb_reason: TEXT,
  taken_at: TEXT,
  width: NUMBER,
  height: NUMBER,
  orientation: NUMBER,
  camera_make: TEXT,
  camera_model: TEXT,
  camera_lens: TEXT,
  exposure_iso: NUMBER,
  exposure_aperture: NUMBER,
  exposure_shutter: NUMBER,
  exposure_focal: NUMBER,
  place_lat: NUMBER,
  place_lon: NUMBER,
  duration_ms: NUMBER,
});

type ItemColumns = z.output<typeof ITEM_COLUMNS>;

function baseOf(row: ItemColumns): Record<string, unknown> {
  return {
    id: row.id,
    rootId: row.root_id,
    parentId: row.parent_id,
    relPath: row.rel_path,
    name: row.name,
    kind: row.kind,
    modifiedAt: row.modified_at,
    addedAt: row.added_at,
    openedAt: row.opened_at,
    starred: row.starred,
    shared: row.shared,
    locked: row.locked,
    lockedHere: row.locked_here,
    openComments: row.open_comments,
    rev: row.rev,
    etag: row.etag,
    outside: row.outside,
    addedByProfileId: row.added_by_profile_id,
    remoteId: row.remote_id,
    remoteRev: row.remote_rev,
  };
}

function thumbOf(row: ItemColumns): Record<string, unknown> {
  return row.thumb_reason === null
    ? { state: row.thumb_state }
    : { state: row.thumb_state, reason: row.thumb_reason };
}

function fileOf(row: ItemColumns): Record<string, unknown> {
  return {
    mime: row.mime,
    bytes: row.bytes,
    sha256: row.sha256,
    integrity: row.integrity,
    thumb: thumbOf(row),
  };
}

function allNull(values: readonly unknown[]): boolean {
  return values.every((value) => value === null);
}

function mediaOf(row: ItemColumns): Record<string, unknown> {
  const camera = [row.camera_make, row.camera_model, row.camera_lens];
  const exposure = [
    row.exposure_iso,
    row.exposure_aperture,
    row.exposure_shutter,
    row.exposure_focal,
  ];
  return {
    takenAt: row.taken_at,
    width: row.width,
    height: row.height,
    orientation: row.orientation,
    camera: allNull(camera)
      ? null
      : { make: row.camera_make, model: row.camera_model, lens: row.camera_lens },
    exposure: allNull(exposure)
      ? null
      : {
          iso: row.exposure_iso,
          aperture: row.exposure_aperture,
          shutter: row.exposure_shutter,
          focal: row.exposure_focal,
        },
    place:
      row.place_lat === null || row.place_lon === null
        ? null
        : { lat: row.place_lat, lon: row.place_lon },
  };
}

function kindFieldsOf(row: ItemColumns): Record<string, unknown> {
  switch (row.kind) {
    case 'folder':
      return {
        childCount: row.child_count,
        bytes: row.bytes,
        colour: row.colour,
        iconHint: row.icon_hint,
      };
    case 'image':
      return { ...fileOf(row), ...mediaOf(row) };
    case 'video':
      return { ...fileOf(row), ...mediaOf(row), durationMs: row.duration_ms };
    case 'audio':
      return { ...fileOf(row), takenAt: row.taken_at, durationMs: row.duration_ms };
    case 'document':
    case 'other':
      return fileOf(row);
    case 'link':
      return { bytes: row.bytes, linkTarget: row.link_target };
    case 'special':
      return { bytes: row.bytes };
  }
}

function storedItemOf(row: ItemColumns): DriveItemEntry {
  return {
    item: DRIVE_ITEM.parse({ ...baseOf(row), ...kindFieldsOf(row) }),
    identity: row.dev === null || row.ino === null ? null : { dev: row.dev, ino: row.ino },
    inodeId: row.inode_id,
  };
}

const STORED_ITEM = storedRow(ITEM_COLUMNS.transform(storedItemOf), {
  flags: ['starred', 'shared', 'locked', 'locked_here', 'icon_hint', 'outside'],
});

export function driveEtag(rev: number, item: DriveItemDraft): string {
  const content =
    'sha256' in item && item.sha256 !== null
      ? item.sha256
      : `${String(item.bytes)}.${String(Date.parse(item.modifiedAt))}`;
  return `${String(rev)}-${content}`;
}

export class DriveItemsRepository {
  private readonly inodes: DriveItemInodes;

  constructor(private readonly context: StoreContext) {
    this.inodes = new DriveItemInodes(context);
  }

  find(id: string, viewer: string | null): DriveItem | undefined {
    return this.stored(id, viewer)?.item;
  }

  byId(id: string, viewer: string | null): DriveItem {
    return found(this.find(id, viewer), 'drive item', id);
  }

  identityOf(id: string): DriveItemIdentity | null {
    return found(this.stored(id, null), 'drive item', id).identity;
  }

  byPath(rootId: string, relPath: string, viewer: string | null): DriveItem | undefined {
    return this.context.sql.get(
      STORED_ITEM,
      `${SELECT} where root_id = $rootId and rel_path = $relPath`,
      { rootId, relPath, viewer, now: this.context.now() },
    )?.item;
  }

  children(query: DriveChildrenQuery): DriveItemWindow {
    const { rootId, parentId, after, limit, viewer } = query;
    const now = this.context.now();
    const rows = this.context.sql.all(
      STORED_ITEM,
      `${SELECT}
        where root_id = $rootId and parent_id is $parentId
          ${after === null ? '' : 'and name > $after'}
        order by name limit $limit`,
      after === null
        ? { rootId, parentId, limit, viewer, now }
        : { rootId, parentId, after, limit, viewer, now },
    );
    const last = rows.at(-1);
    return {
      entries: rows,
      next: rows.length === limit && last !== undefined ? last.item.name : null,
    };
  }

  sortedChildren(query: DriveSortedChildrenQuery): DriveSortedWindow {
    const { rootId, parentId, limit, viewer } = query;
    const order = sortOrderOf(query.sort, query.after);
    const entries = this.context.sql.all(
      STORED_ITEM,
      `${SELECT} where root_id = $rootId and parent_id is $parentId ${order.where} ${order.orderBy} limit $limit`,
      { rootId, parentId, limit, viewer, now: this.context.now(), ...order.parameters },
    );
    return { entries, next: nextMarkOf(this.context, query, entries) };
  }

  write(request: DriveItemWrite): DriveItemWriteResult {
    return this.context.write(() => {
      const input = this.aligned(request);
      const existing = this.stored(input.item.id, null);
      if (existing === undefined) {
        const created = this.candidate(input, 1);
        this.save(true, created, input.identity, this.inodeFor(input, created));
        return { item: this.byId(created.id, null), changed: true };
      }
      return this.update(input, existing);
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      this.byId(id, null);
      this.context.sql.run('remove the drive item', 'delete from drive_items where id = $id', {
        id,
      });
    });
  }

  private stored(id: string, viewer: string | null): DriveItemEntry | undefined {
    return this.context.sql.get(STORED_ITEM, `${SELECT} where id = $id`, {
      id,
      viewer,
      now: this.context.now(),
    });
  }

  private update(input: DriveItemWrite, existing: DriveItemEntry): DriveItemWriteResult {
    if (input.shareInode !== undefined && input.shareInode !== existing.inodeId) {
      throw new DriveInodeError(
        `The drive item ${input.item.id} already has inode ${String(existing.inodeId)}, so it cannot share inode ${String(input.shareInode)}.`,
      );
    }
    const patch = input.inode ?? {};
    const same = this.candidate(input, existing.item.rev);
    const changes = this.inodes.changes(this.inodes.byId(existing.inodeId), patch, same);
    if (changes === null && this.unchanged(existing, same, input.identity)) {
      return { item: existing.item, changed: false };
    }
    const bumped = this.candidate(input, existing.item.rev + 1);
    this.save(false, bumped, input.identity, existing.inodeId);
    if (changes !== null) this.inodes.apply(existing.inodeId, patch, changes);
    if (bumped.kind === 'image' || bumped.kind === 'video') {
      invalidateDerivedRevision(this.context, bumped.id);
    }
    return { item: this.byId(bumped.id, null), changed: true };
  }

  private inodeFor(input: DriveItemWrite, item: DriveItem): number {
    return input.shareInode === undefined
      ? this.inodes.create(item, input.inode ?? {})
      : this.inodes.share(item, input.shareInode);
  }

  private aligned(input: DriveItemWrite): DriveItemWrite {
    const mtimeNs = input.inode?.mtimeNs;
    return mtimeNs === undefined
      ? input
      : { ...input, item: { ...input.item, modifiedAt: momentOfNs(mtimeNs) } };
  }

  private candidate(input: DriveItemWrite, rev: number): DriveItem {
    return DRIVE_ITEM.parse({
      ...input.item,
      openedAt: null,
      locked: false,
      lockedHere: false,
      openComments: 0,
      ...(input.item.kind === 'folder' ? { colour: null, iconHint: false } : {}),
      rev,
      etag: driveEtag(rev, input.item),
    });
  }

  private unchanged(
    existing: DriveItemEntry,
    candidate: DriveItem,
    identity: DriveItemIdentity,
  ): boolean {
    return (
      existing.identity !== null &&
      sameStored(itemColumns(existing.item, existing.identity), itemColumns(candidate, identity))
    );
  }

  private save(
    created: boolean,
    item: DriveItem,
    identity: DriveItemIdentity,
    inodeId: number,
  ): void {
    const columns = { ...itemColumns(item, identity), inode_id: inodeId };
    const names = Object.keys(columns);
    if (created) {
      this.context.sql.run(
        'create the drive item',
        `insert into drive_items (${names.join(', ')}) values (${names
          .map((name) => `$${name}`)
          .join(', ')})`,
        columns,
      );
      return;
    }
    this.context.sql.run(
      'update the drive item',
      `update drive_items set ${names
        .filter((name) => name !== 'id')
        .map((name) => `${name} = $${name}`)
        .join(', ')} where id = $id`,
      columns,
    );
  }
}
