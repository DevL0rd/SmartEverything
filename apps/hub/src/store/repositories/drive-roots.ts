import {
  DRIVE_ROOT,
  DRIVE_ROOT_SCOPES,
  DRIVE_ROOT_STATES,
  type DriveRoot,
  type DriveRootHealth,
  type DriveRootScope,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { driveFolderOf, type DriveFolders } from '../../data-layout/drive-folders';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText, whenDefined } from '../sql';

export type StoredDrive = DriveRoot & { readonly path: string };

export class DriveFoldersMissingError extends Error {
  override readonly name = 'DriveFoldersMissingError';

  constructor() {
    super('This store was opened without drive folders, so it cannot place a drive.');
  }
}

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

function findDriveRootRow(context: StoreContext, id: string): DriveRoot | undefined {
  return context.sql.get(STORED_ROOT, `select ${COLUMNS} from drive_roots where id = $id`, { id });
}

export function driveRootRow(context: StoreContext, id: string): DriveRoot {
  return found(findDriveRootRow(context, id), 'drive', id);
}

type TotalsSettled = (rootId: string) => void;

function sameTotals(left: DriveRoot, right: DriveRoot): boolean {
  return left.items === right.items && left.folders === right.folders && left.bytes === right.bytes;
}

export class DriveRootTotals {
  private readonly before = new Map<string, DriveRoot>();
  private readonly listeners = new Set<TotalsSettled>();

  constructor(private readonly context: StoreContext) {
    context.enlist(() => {
      this.flush();
    });
  }

  changing(rootId: string): void {
    if (!this.before.has(rootId)) this.before.set(rootId, driveRootRow(this.context, rootId));
    this.settle(rootId);
  }

  announced(row: DriveRoot): void {
    if (this.before.has(row.id)) this.before.set(row.id, row);
  }

  onSettled(listener: TotalsSettled): void {
    this.listeners.add(listener);
  }

  private flush(): void {
    const pending = [...this.before];
    this.before.clear();
    for (const [rootId, before] of pending) {
      this.settle(rootId);
      const after = findDriveRootRow(this.context, rootId);
      if (after === undefined || sameTotals(before, after)) continue;
      this.context.changed('drive_roots', 'UPDATE', after, before);
    }
  }

  private settle(rootId: string): void {
    for (const listener of this.listeners) listener(rootId);
  }
}

const TOTALS = new WeakMap<StoreContext, DriveRootTotals>();

export function driveRootTotals(context: StoreContext): DriveRootTotals {
  const known = TOTALS.get(context);
  if (known !== undefined) return known;
  const created = new DriveRootTotals(context);
  TOTALS.set(context, created);
  return created;
}

export interface DriveRootPatch {
  readonly versions?: boolean | undefined;
  readonly indexId?: string;
  readonly state?: DriveRoot['state'];
  readonly stateReason?: string | null;
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
  private readonly cached = new Map<string, DriveRoot>();
  private readonly totals: DriveRootTotals;

  constructor(
    private readonly context: StoreContext,
    private readonly folders: DriveFolders | null,
  ) {
    this.totals = driveRootTotals(context);
    this.totals.onSettled((rootId) => {
      this.cached.delete(rootId);
    });
    context.onForeignCommit(() => {
      this.cached.clear();
    });
  }

  list(): StoredDrive[] {
    return this.records().map((root) => this.stored(root));
  }

  records(): DriveRoot[] {
    return this.context.sql.all(
      STORED_ROOT,
      `select ${COLUMNS} from drive_roots order by scope, owner_profile_id, id`,
    );
  }

  find(id: string): StoredDrive | undefined {
    const root = this.record(id);
    return root === undefined ? undefined : this.stored(root);
  }

  record(id: string): DriveRoot | undefined {
    const root = this.cached.get(id) ?? this.row(id);
    if (root !== undefined && !this.context.sql.inTransaction()) this.cached.set(id, root);
    return root;
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
    this.cached.delete(root.id);
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
    this.cached.delete(id);
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
      this.totals.announced(row);
      return this.stored(row);
    });
  }

  private row(id: string): DriveRoot | undefined {
    return findDriveRootRow(this.context, id);
  }

  private rowOf(id: string): DriveRoot {
    return driveRootRow(this.context, id);
  }

  private stored(root: DriveRoot): StoredDrive {
    if (this.folders === null) throw new DriveFoldersMissingError();
    return { ...root, path: driveFolderOf(this.folders, root.scope, root.ownerProfileId) };
  }
}
