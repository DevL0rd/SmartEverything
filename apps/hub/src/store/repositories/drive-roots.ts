import {
  DRIVE_ROOT,
  DRIVE_ROOT_KINDS,
  DRIVE_ROOT_SCOPES,
  DRIVE_ROOT_STATES,
  DRIVE_ROOT_SYNC,
  type DriveRoot,
  type DriveRootHealth,
  type DriveRootSync,
  type DriveVolume,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText, whenDefined } from '../sql';
import { DrivePlacementsRepository } from './drive-placements';

export const UNSYNCED: DriveRootSync = {
  ignorePatterns: [],
  conflictCopies: true,
  clients: [],
};

const COLUMNS = `id, kind, label, scope, owner_profile_id, path, read_only, versions, synced, index_id,
  state, state_reason, items, folders, bytes, scanned_at, hashed_share, verified_share, corrupt,
  last_scrub_at, last_backup_at, in_photos, skip_patterns, include_hidden, volume, sync`;

const ROOT_COLUMNS = z.strictObject({
  id: z.string(),
  kind: z.enum(DRIVE_ROOT_KINDS),
  label: z.string(),
  scope: z.enum(DRIVE_ROOT_SCOPES),
  owner_profile_id: z.string().nullable(),
  path: z.string().nullable(),
  read_only: z.boolean(),
  versions: z.boolean(),
  synced: z.boolean(),
  index_id: z.string(),
  state: z.enum(DRIVE_ROOT_STATES),
  state_reason: z.string().nullable(),
  items: z.number(),
  folders: z.number(),
  bytes: z.number(),
  scanned_at: z.string().nullable(),
  hashed_share: z.number(),
  verified_share: z.number(),
  corrupt: z.number(),
  last_scrub_at: z.string().nullable(),
  last_backup_at: z.string().nullable(),
  in_photos: z.boolean(),
  skip_patterns: z.unknown(),
  include_hidden: z.boolean(),
  volume: z.unknown(),
  sync: z.unknown(),
});

type RootColumns = z.output<typeof ROOT_COLUMNS>;

function physicalFields(row: RootColumns): Record<string, unknown> {
  return {
    volume: row.volume,
    synced: row.synced,
    sync: row.synced ? DRIVE_ROOT_SYNC.parse(row.sync) : UNSYNCED,
  };
}

function virtualFields(row: RootColumns): Record<string, unknown> {
  return { synced: row.synced, sync: null };
}

function rootOf(row: RootColumns): DriveRoot {
  return DRIVE_ROOT.parse({
    id: row.id,
    kind: row.kind,
    label: row.label,
    scope: row.scope,
    ownerProfileId: row.owner_profile_id,
    path: row.path,
    readOnly: row.read_only,
    versions: row.versions,
    indexId: row.index_id,
    state: row.state,
    stateReason: row.state_reason,
    items: row.items,
    folders: row.folders,
    bytes: row.bytes,
    scannedAt: row.scanned_at,
    health: {
      hashedShare: row.hashed_share,
      verifiedShare: row.verified_share,
      corrupt: row.corrupt,
      lastScrubAt: row.last_scrub_at,
      lastBackupAt: row.last_backup_at,
    },
    inPhotos: row.in_photos,
    skipPatterns: row.skip_patterns,
    includeHidden: row.include_hidden,
    ...(row.path === null ? virtualFields(row) : physicalFields(row)),
  });
}

const STORED_ROOT = storedRow(ROOT_COLUMNS.transform(rootOf), {
  flags: ['read_only', 'versions', 'synced', 'in_photos', 'include_hidden'],
  json: ['skip_patterns', 'volume', 'sync'],
});

function syncText(root: DriveRoot): string | null {
  return root.synced ? jsonText(root.sync) : null;
}

function volumeText(root: DriveRoot): string | null {
  return 'volume' in root && root.volume !== null ? jsonText(root.volume) : null;
}

function insertParameters(root: DriveRoot, now: string): Record<string, SQLInputValue> {
  return {
    id: root.id,
    kind: root.kind,
    label: root.label,
    scope: root.scope,
    owner: root.ownerProfileId,
    path: root.path,
    readOnly: flag(root.readOnly),
    versions: flag(root.versions),
    synced: flag(root.synced),
    indexId: root.indexId,
    state: root.state,
    stateReason: root.stateReason,
    items: root.items,
    folders: root.folders,
    bytes: root.bytes,
    scannedAt: root.scannedAt,
    hashed: root.health.hashedShare,
    verified: root.health.verifiedShare,
    corrupt: root.health.corrupt,
    lastScrub: root.health.lastScrubAt,
    lastBackup: root.health.lastBackupAt,
    inPhotos: flag(root.inPhotos),
    skip: jsonText(root.skipPatterns),
    hidden: flag(root.includeHidden),
    volume: volumeText(root),
    sync: syncText(root),
    now,
  };
}

export interface DriveRootPatch {
  readonly label?: string;
  readonly readOnly?: boolean;
  readonly versions?: boolean;
  readonly sync?: DriveRootSync | null;
  readonly indexId?: string;
  readonly state?: DriveRoot['state'];
  readonly stateReason?: string | null;
  readonly items?: number;
  readonly folders?: number;
  readonly bytes?: number;
  readonly scannedAt?: string | null;
  readonly health?: DriveRootHealth;
  readonly inPhotos?: boolean;
  readonly skipPatterns?: readonly string[];
  readonly includeHidden?: boolean;
  readonly volume?: DriveVolume | null;
}

function patchColumns(patch: DriveRootPatch): Record<string, SQLInputValue | undefined> {
  return {
    label: patch.label,
    read_only: whenDefined(patch.readOnly, flag),
    versions: whenDefined(patch.versions, flag),
    synced: whenDefined(patch.sync, (sync) => flag(sync !== null)),
    sync: whenDefined(patch.sync, (sync) => (sync === null ? null : jsonText(sync))),
    index_id: patch.indexId,
    state: patch.state,
    state_reason: patch.stateReason,
    items: patch.items,
    folders: patch.folders,
    bytes: patch.bytes,
    scanned_at: patch.scannedAt,
    in_photos: whenDefined(patch.inPhotos, flag),
    skip_patterns: whenDefined(patch.skipPatterns, jsonText),
    include_hidden: whenDefined(patch.includeHidden, flag),
    volume: whenDefined(patch.volume, (volume) => (volume === null ? null : jsonText(volume))),
    ...healthColumns(patch.health),
  };
}

function healthColumns(
  health: DriveRootHealth | undefined,
): Record<string, SQLInputValue | undefined> {
  return {
    hashed_share: health?.hashedShare,
    verified_share: health?.verifiedShare,
    corrupt: health?.corrupt,
    last_scrub_at: health?.lastScrubAt,
    last_backup_at: health?.lastBackupAt,
  };
}

export class DriveRootsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): DriveRoot[] {
    return this.context.sql.all(
      STORED_ROOT,
      `select ${COLUMNS} from drive_roots order by label, id`,
    );
  }

  find(id: string): DriveRoot | undefined {
    return this.context.sql.get(STORED_ROOT, `select ${COLUMNS} from drive_roots where id = $id`, {
      id,
    });
  }

  byId(id: string): DriveRoot {
    return found(this.find(id), 'drive root', id);
  }

  byPath(path: string): DriveRoot | undefined {
    return this.context.sql.get(
      STORED_ROOT,
      `select ${COLUMNS} from drive_roots where path = $path`,
      { path },
    );
  }

  insert(root: DriveRoot): DriveRoot {
    return this.context.write(() => {
      this.context.sql.run(
        'create the drive root',
        `insert into drive_roots (${COLUMNS}, created_at, updated_at) values ($id, $kind, $label,
          $scope, $owner, $path, $readOnly, $versions, $synced, $indexId, $state, $stateReason,
          $items, $folders, $bytes, $scannedAt, $hashed, $verified, $corrupt, $lastScrub,
          $lastBackup, $inPhotos, $skip, $hidden, $volume, $sync, $now, $now)`,
        insertParameters(root, this.context.now()),
      );
      const row = this.byId(root.id);
      this.context.changed('drive_roots', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, patch: DriveRootPatch): DriveRoot {
    return this.context.write(() => {
      const before = this.byId(id);
      const changes = assignments({ ...patchColumns(patch), updated_at: this.context.now() });
      this.context.sql.run(
        'update the drive root',
        `update drive_roots set ${changes.text} where id = $id`,
        { ...changes.parameters, id },
      );
      const row = this.byId(id);
      this.context.changed('drive_roots', 'UPDATE', row, before);
      return row;
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      const placements = new DrivePlacementsRepository(this.context);
      for (const placement of placements.forRoot(id)) placements.remove(placement.id);
      this.context.sql.run('remove the drive root', 'delete from drive_roots where id = $id', {
        id,
      });
      this.context.changed('drive_roots', 'DELETE', null, before);
    });
  }
}
