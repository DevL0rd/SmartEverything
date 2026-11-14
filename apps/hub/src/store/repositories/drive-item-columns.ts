import type { DriveItem } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { flag } from '../sql';
import type { DriveItemIdentity } from './drive-items';

export type Columns = Record<string, SQLInputValue>;

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

export function itemColumns(item: DriveItem, identity: DriveItemIdentity): Columns {
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

export function sameStored(left: Columns, right: Columns): boolean {
  return Object.keys(left).every((column) => left[column] === right[column]);
}
