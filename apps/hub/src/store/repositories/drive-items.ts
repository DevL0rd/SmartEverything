import {
  DRIVE_INTEGRITY,
  DRIVE_ITEM,
  DRIVE_ITEM_KINDS,
  type DriveItem,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { flag } from '../sql';

export interface DriveItemIdentity {
  readonly dev: string;
  readonly ino: string;
}

type Draft<T> = T extends unknown ? Omit<T, 'rev' | 'etag' | 'openedAt'> : never;

export type DriveItemDraft = Draft<DriveItem>;

export interface DriveItemWrite {
  readonly item: DriveItemDraft;
  readonly identity: DriveItemIdentity;
}

export interface DriveItemWriteResult {
  readonly item: DriveItem;
  readonly changed: boolean;
}

export interface DriveItemEntry {
  readonly item: DriveItem;
  readonly identity: DriveItemIdentity | null;
}

export interface DriveItemWindow {
  readonly entries: readonly DriveItemEntry[];
  readonly next: string | null;
}

const COLUMNS = `id, root_id, parent_id, rel_path, name, kind, mime, bytes, child_count, sha256,
  integrity, dev, ino, modified_at, added_at, opened_at, starred, rev, etag, outside,
  added_by_profile_id, remote_id, remote_rev, thumb_state, thumb_reason, taken_at, width, height,
  orientation, camera_make, camera_model, camera_lens, exposure_iso, exposure_aperture,
  exposure_shutter, exposure_focal, place_lat, place_lon, duration_ms`;

const TEXT = z.string().nullable();
const NUMBER = z.number().nullable();

const ITEM_COLUMNS = z.strictObject({
  id: z.string(),
  root_id: z.string(),
  parent_id: TEXT,
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
      return { childCount: row.child_count, bytes: row.bytes };
    case 'image':
      return { ...fileOf(row), ...mediaOf(row) };
    case 'video':
      return { ...fileOf(row), ...mediaOf(row), durationMs: row.duration_ms };
    case 'audio':
      return { ...fileOf(row), takenAt: row.taken_at, durationMs: row.duration_ms };
    case 'document':
    case 'other':
      return fileOf(row);
  }
}

function storedItemOf(row: ItemColumns): DriveItemEntry {
  return {
    item: DRIVE_ITEM.parse({ ...baseOf(row), ...kindFieldsOf(row) }),
    identity: row.dev === null || row.ino === null ? null : { dev: row.dev, ino: row.ino },
  };
}

const STORED_ITEM = storedRow(ITEM_COLUMNS.transform(storedItemOf), {
  flags: ['starred', 'outside'],
});

export function driveEtag(rev: number, item: DriveItemDraft): string {
  const content =
    item.kind !== 'folder' && item.sha256 !== null
      ? item.sha256
      : `${String(item.bytes)}.${String(Date.parse(item.modifiedAt))}`;
  return `${String(rev)}-${content}`;
}

type Columns = Record<string, SQLInputValue>;

type Visual = Extract<DriveItem, { readonly kind: 'image' | 'video' }>;

const NO_VISUAL: Columns = Object.fromEntries(
  [
    'width',
    'height',
    'orientation',
    'place_lat',
    'place_lon',
    'camera_make',
    'camera_model',
    'camera_lens',
    'exposure_iso',
    'exposure_aperture',
    'exposure_shutter',
    'exposure_focal',
  ].map((column) => [column, null]),
);

function cameraColumns(camera: Visual['camera']): Columns {
  return {
    camera_make: camera?.make ?? null,
    camera_model: camera?.model ?? null,
    camera_lens: camera?.lens ?? null,
  };
}

function exposureColumns(exposure: Visual['exposure']): Columns {
  return {
    exposure_iso: exposure?.iso ?? null,
    exposure_aperture: exposure?.aperture ?? null,
    exposure_shutter: exposure?.shutter ?? null,
    exposure_focal: exposure?.focal ?? null,
  };
}

function visualColumns(item: Visual): Columns {
  return {
    width: item.width,
    height: item.height,
    orientation: item.orientation,
    place_lat: item.place?.lat ?? null,
    place_lon: item.place?.lon ?? null,
    ...cameraColumns(item.camera),
    ...exposureColumns(item.exposure),
  };
}

function mediaColumns(item: DriveItem): Columns {
  return {
    taken_at: 'takenAt' in item ? item.takenAt : null,
    duration_ms: 'durationMs' in item ? item.durationMs : null,
    ...(item.kind === 'image' || item.kind === 'video' ? visualColumns(item) : NO_VISUAL),
  };
}

function contentColumns(item: DriveItem): Columns {
  if (item.kind === 'folder') {
    return {
      mime: null,
      child_count: item.childCount,
      sha256: null,
      integrity: 'unknown',
      thumb_state: 'none',
      thumb_reason: null,
    };
  }
  return {
    mime: item.mime,
    child_count: null,
    sha256: item.sha256,
    integrity: item.integrity,
    thumb_state: item.thumb.state,
    thumb_reason: 'reason' in item.thumb ? item.thumb.reason : null,
  };
}

function itemColumns(item: DriveItem, identity: DriveItemIdentity): Columns {
  return {
    id: item.id,
    root_id: item.rootId,
    parent_id: item.parentId,
    rel_path: item.relPath,
    name: item.name,
    kind: item.kind,
    bytes: item.bytes,
    dev: identity.dev,
    ino: identity.ino,
    modified_at: item.modifiedAt,
    added_at: item.addedAt,
    starred: flag(item.starred),
    rev: item.rev,
    etag: item.etag,
    outside: flag(item.outside),
    added_by_profile_id: item.addedByProfileId,
    remote_id: item.remoteId,
    remote_rev: item.remoteRev,
    ...contentColumns(item),
    ...mediaColumns(item),
  };
}

function sameStored(left: Columns, right: Columns): boolean {
  return Object.keys(left).every((column) => left[column] === right[column]);
}

export class DriveItemsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveItem | undefined {
    return this.stored(id)?.item;
  }

  byId(id: string): DriveItem {
    return found(this.find(id), 'drive item', id);
  }

  identityOf(id: string): DriveItemIdentity | null {
    return found(this.stored(id), 'drive item', id).identity;
  }

  byPath(rootId: string, relPath: string): DriveItem | undefined {
    return this.context.sql.get(
      STORED_ITEM,
      `select ${COLUMNS} from drive_items where root_id = $rootId and rel_path = $relPath`,
      { rootId, relPath },
    )?.item;
  }

  children(
    rootId: string,
    parentId: string | null,
    after: string | null,
    limit: number,
  ): DriveItemWindow {
    const rows = this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from drive_items
        where root_id = $rootId and parent_id is $parentId
          ${after === null ? '' : 'and name > $after'}
        order by name limit $limit`,
      after === null ? { rootId, parentId, limit } : { rootId, parentId, after, limit },
    );
    const last = rows.at(-1);
    return {
      entries: rows,
      next: rows.length === limit && last !== undefined ? last.item.name : null,
    };
  }

  write(input: DriveItemWrite): DriveItemWriteResult {
    return this.context.write(() => {
      const existing = this.stored(input.item.id);
      if (existing === undefined) {
        const created = this.candidate(input, 1, null);
        this.save(true, created, input.identity);
        return { item: this.byId(created.id), changed: true };
      }
      const same = this.candidate(input, existing.item.rev, existing.item.openedAt);
      if (this.unchanged(existing, same, input.identity)) {
        return { item: existing.item, changed: false };
      }
      const bumped = this.candidate(input, existing.item.rev + 1, existing.item.openedAt);
      this.save(false, bumped, input.identity);
      return { item: this.byId(bumped.id), changed: true };
    });
  }

  markOpened(id: string, at: string): void {
    this.context.write(() => {
      this.byId(id);
      this.context.sql.run(
        'mark the drive item opened',
        'update drive_items set opened_at = $at where id = $id',
        { id, at },
      );
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      this.byId(id);
      this.context.sql.run('remove the drive item', 'delete from drive_items where id = $id', {
        id,
      });
    });
  }

  private stored(id: string): DriveItemEntry | undefined {
    return this.context.sql.get(STORED_ITEM, `select ${COLUMNS} from drive_items where id = $id`, {
      id,
    });
  }

  private candidate(input: DriveItemWrite, rev: number, openedAt: string | null): DriveItem {
    return DRIVE_ITEM.parse({
      ...input.item,
      openedAt,
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

  private save(created: boolean, item: DriveItem, identity: DriveItemIdentity): void {
    const columns = itemColumns(item, identity);
    const names = Object.keys(columns);
    if (created) {
      this.context.sql.run(
        'create the drive item',
        `insert into drive_items (${names.join(', ')}, opened_at) values (${names
          .map((name) => `$${name}`)
          .join(', ')}, null)`,
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
