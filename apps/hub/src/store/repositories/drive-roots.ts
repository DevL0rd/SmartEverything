import {
  DRIVE_ROOT,
  DRIVE_ROOT_SCOPES,
  DRIVE_ROOT_STATES,
  type DriveRoot,
  type DriveRootHealth,
  type DriveRootScope,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText, whenDefined } from '../sql';

export type StoredDrive = DriveRoot & { readonly path: string };

export type DrivePathOf = (scope: DriveRootScope, ownerProfileId: string | null) => string;

const COLUMNS = `id, scope, owner_profile_id, index_id, state, state_reason, items, folders, bytes,
  scanned_at, hashed_share, verified_share, corrupt, last_scrub_at, last_backup_at, versions,
  skip_patterns, include_hidden`;

const ROOT_COLUMNS = z.strictObject({
  id: z.string(),
  scope: z.enum(DRIVE_ROOT_SCOPES),
  owner_profile_id: z.string().nullable(),
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
  versions: z.boolean(),
  skip_patterns: z.unknown(),
  include_hidden: z.boolean(),
});

function rootOf(row: z.output<typeof ROOT_COLUMNS>): DriveRoot {
  return DRIVE_ROOT.parse({
    id: row.id,
    scope: row.scope,
    ownerProfileId: row.owner_profile_id,
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
    versions: row.versions,
    skipPatterns: row.skip_patterns,
    includeHidden: row.include_hidden,
  });
}

const STORED_ROOT = storedRow(ROOT_COLUMNS.transform(rootOf), {
  flags: ['versions', 'include_hidden'],
  json: ['skip_patterns'],
});

function insertParameters(root: DriveRoot, now: string): Record<string, SQLInputValue> {
  return {
    id: root.id,
    scope: root.scope,
    owner: root.ownerProfileId,
    versions: flag(root.versions),
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
    skip: jsonText(root.skipPatterns),
    hidden: flag(root.includeHidden),
    now,
  };
}

export interface DriveRootPatch {
  readonly versions?: boolean | undefined;
  readonly indexId?: string;
  readonly state?: DriveRoot['state'];
  readonly stateReason?: string | null;
  readonly items?: number;
  readonly folders?: number;
  readonly bytes?: number;
  readonly scannedAt?: string | null;
  readonly health?: DriveRootHealth;
  readonly skipPatterns?: readonly string[] | undefined;
  readonly includeHidden?: boolean | undefined;
}

function patchColumns(patch: DriveRootPatch): Record<string, SQLInputValue | undefined> {
  return {
    versions: whenDefined(patch.versions, flag),
    index_id: patch.indexId,
    state: patch.state,
    state_reason: patch.stateReason,
    items: patch.items,
    folders: patch.folders,
    bytes: patch.bytes,
    scanned_at: patch.scannedAt,
    skip_patterns: whenDefined(patch.skipPatterns, jsonText),
    include_hidden: whenDefined(patch.includeHidden, flag),
    hashed_share: patch.health?.hashedShare,
    verified_share: patch.health?.verifiedShare,
    corrupt: patch.health?.corrupt,
    last_scrub_at: patch.health?.lastScrubAt,
    last_backup_at: patch.health?.lastBackupAt,
  };
}

export class DriveRootsRepository {
  constructor(
    private readonly context: StoreContext,
    private readonly drivePathOf: DrivePathOf,
  ) {}

  list(): StoredDrive[] {
    return this.context.sql
      .all(STORED_ROOT, `select ${COLUMNS} from drive_roots order by scope, owner_profile_id, id`)
      .map((root) => this.stored(root));
  }

  find(id: string): StoredDrive | undefined {
    const root = this.row(id);
    return root === undefined ? undefined : this.stored(root);
  }

  byId(id: string): StoredDrive {
    return found(this.find(id), 'drive', id);
  }

  byIdentity(scope: DriveRootScope, ownerProfileId: string | null): StoredDrive | undefined {
    const root = this.context.sql.get(
      STORED_ROOT,
      `select ${COLUMNS} from drive_roots where scope = $scope and owner_profile_id is $owner`,
      { scope, owner: ownerProfileId },
    );
    return root === undefined ? undefined : this.stored(root);
  }

  insert(root: DriveRoot): StoredDrive {
    return this.context.write(() => {
      this.context.sql.run(
        'create the drive',
        `insert into drive_roots (${COLUMNS}, created_at, updated_at) values ($id, $scope, $owner,
          $indexId, $state, $stateReason, $items, $folders, $bytes, $scannedAt, $hashed, $verified,
          $corrupt, $lastScrub, $lastBackup, $versions, $skip, $hidden, $now, $now)`,
        insertParameters(root, this.context.now()),
      );
      const row = this.rowOf(root.id);
      this.context.changed('drive_roots', 'INSERT', row, null);
      return this.stored(row);
    });
  }

  update(id: string, patch: DriveRootPatch): StoredDrive {
    return this.context.write(() => {
      const before = this.rowOf(id);
      const changes = assignments({ ...patchColumns(patch), updated_at: this.context.now() });
      this.context.sql.run(
        'update the drive',
        `update drive_roots set ${changes.text} where id = $id`,
        { ...changes.parameters, id },
      );
      const row = this.rowOf(id);
      this.context.changed('drive_roots', 'UPDATE', row, before);
      return this.stored(row);
    });
  }

  private row(id: string): DriveRoot | undefined {
    return this.context.sql.get(STORED_ROOT, `select ${COLUMNS} from drive_roots where id = $id`, {
      id,
    });
  }

  private rowOf(id: string): DriveRoot {
    return found(this.row(id), 'drive', id);
  }

  private stored(root: DriveRoot): StoredDrive {
    return { ...root, path: this.drivePathOf(root.scope, root.ownerProfileId) };
  }
}
