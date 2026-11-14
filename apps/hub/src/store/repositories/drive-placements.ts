import {
  DRIVE_PLACEMENT,
  DRIVE_PLACEMENT_BASIC_LIMITS,
  DRIVE_PLACEMENT_HOLD,
  DRIVE_PLACEMENT_MODE,
  DRIVE_PLACEMENT_ROUTES,
  DRIVE_PLACEMENT_STATE,
  DRIVE_PLACEMENT_TIERS,
  DRIVE_SYNC_ERROR,
  type DrivePlacement,
  type DrivePlacementHold,
  type DrivePlacementMode,
  type DrivePlacementStatus,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const COLUMNS = `id, device_id, root_id, folder_item_id, mode, local_path, enabled, hold, created_by,
  created_at, excluded, ignore_patterns, conflict_copies, state, tier, basic_limits, read_only,
  route, cache_bytes, pinned_bytes, open_files, pending_uploads, need_bytes, last_synced_at, errors,
  reason, reported_at`;

const PLACEMENT_COLUMNS = z.strictObject({
  id: z.string(),
  device_id: z.string(),
  root_id: z.string(),
  folder_item_id: z.string().nullable(),
  mode: DRIVE_PLACEMENT_MODE,
  local_path: z.string(),
  enabled: z.boolean(),
  hold: DRIVE_PLACEMENT_HOLD.nullable(),
  created_by: z.string(),
  created_at: z.string(),
  excluded: z.array(z.string()).nullable(),
  ignore_patterns: z.array(z.string()).nullable(),
  conflict_copies: z.boolean().nullable(),
  state: DRIVE_PLACEMENT_STATE,
  tier: z.enum(DRIVE_PLACEMENT_TIERS).nullable(),
  basic_limits: DRIVE_PLACEMENT_BASIC_LIMITS.nullable(),
  read_only: z.boolean(),
  route: z.enum(DRIVE_PLACEMENT_ROUTES).nullable(),
  cache_bytes: z.number(),
  pinned_bytes: z.number(),
  open_files: z.number(),
  pending_uploads: z.number(),
  need_bytes: z.number(),
  last_synced_at: z.string().nullable(),
  errors: z.array(z.unknown()),
  reason: z.string().nullable(),
  reported_at: z.string(),
});

function syncSettingsOf(row: z.output<typeof PLACEMENT_COLUMNS>): Record<string, unknown> {
  return row.mode === 'synced'
    ? {
        excluded: row.excluded,
        ignorePatterns: row.ignore_patterns,
        conflictCopies: row.conflict_copies,
      }
    : {};
}

const STORED_PLACEMENT = storedRow(
  PLACEMENT_COLUMNS.transform((row): DrivePlacement =>
    DRIVE_PLACEMENT.parse({
      id: row.id,
      deviceId: row.device_id,
      rootId: row.root_id,
      folderItemId: row.folder_item_id,
      mode: row.mode,
      localPath: row.local_path,
      enabled: row.enabled,
      hold: row.hold,
      createdBy: row.created_by,
      createdAt: row.created_at,
      ...syncSettingsOf(row),
      status: {
        state: row.state,
        tier: row.tier,
        basicLimits: row.basic_limits,
        readOnly: row.read_only,
        route: row.route,
        cacheBytes: row.cache_bytes,
        pinnedBytes: row.pinned_bytes,
        openFiles: row.open_files,
        pendingUploads: row.pending_uploads,
        needBytes: row.need_bytes,
        lastSyncedAt: row.last_synced_at,
        errors: row.errors,
        reason: row.reason,
        reportedAt: row.reported_at,
      },
    }),
  ),
  {
    flags: ['enabled', 'read_only'],
    nullableFlags: ['conflict_copies'],
    json: ['basic_limits', 'excluded', 'ignore_patterns', 'errors'],
  },
);

export interface DrivePlacementInsert {
  readonly id: string;
  readonly deviceId: string;
  readonly rootId: string;
  readonly folderItemId: string | null;
  readonly mode: DrivePlacementMode;
  readonly localPath: string;
  readonly enabled: boolean;
  readonly createdBy: string;
  readonly excluded?: readonly string[];
  readonly ignorePatterns?: readonly string[];
  readonly conflictCopies?: boolean;
  readonly status: DrivePlacementStatus;
}

export interface DrivePlacementTarget {
  readonly mode: DrivePlacementMode;
  readonly localPath: string;
  readonly enabled: boolean;
  readonly readOnly: boolean;
  readonly excluded?: readonly string[];
  readonly ignorePatterns?: readonly string[];
  readonly conflictCopies?: boolean;
}

function settingsParameters(
  settings: Pick<DrivePlacementTarget, 'excluded' | 'ignorePatterns' | 'conflictCopies'>,
): Record<string, string | number | null> {
  return {
    excluded: settings.excluded === undefined ? null : jsonText(settings.excluded),
    ignorePatterns:
      settings.ignorePatterns === undefined ? null : jsonText(settings.ignorePatterns),
    conflictCopies: settings.conflictCopies === undefined ? null : settings.conflictCopies ? 1 : 0,
  };
}

export class DrivePlacementsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): DrivePlacement[] {
    return this.context.sql.all(
      STORED_PLACEMENT,
      `select ${COLUMNS} from drive_placements order by created_at, id`,
    );
  }

  find(id: string): DrivePlacement | undefined {
    return this.context.sql.get(
      STORED_PLACEMENT,
      `select ${COLUMNS} from drive_placements where id = $id`,
      { id },
    );
  }

  byId(id: string): DrivePlacement {
    return found(this.find(id), 'drive placement', id);
  }

  forDevice(deviceId: string): DrivePlacement[] {
    return this.context.sql.all(
      STORED_PLACEMENT,
      `select ${COLUMNS} from drive_placements where device_id = $deviceId order by created_at, id`,
      { deviceId },
    );
  }

  forRoot(rootId: string): DrivePlacement[] {
    return this.context.sql.all(
      STORED_PLACEMENT,
      `select ${COLUMNS} from drive_placements where root_id = $rootId order by created_at, id`,
      { rootId },
    );
  }

  forFolder(folderItemId: string): DrivePlacement[] {
    return this.context.sql.all(
      STORED_PLACEMENT,
      `select ${COLUMNS} from drive_placements where folder_item_id = $folderItemId
        order by created_at, id`,
      { folderItemId },
    );
  }

  insert(placement: DrivePlacementInsert): DrivePlacement {
    return this.context.write(() => {
      const { status } = placement;
      this.context.sql.run(
        'create the drive placement',
        `insert into drive_placements (${COLUMNS}) values ($id, $deviceId, $rootId, $folderItemId,
          $mode, $localPath, $enabled, null, $createdBy, $now, $excluded, $ignorePatterns,
          $conflictCopies, $state, $tier, $basicLimits, $readOnly, $route, $cacheBytes,
          $pinnedBytes, $openFiles, $pendingUploads, $needBytes, $lastSyncedAt, $errors, $reason,
          $reportedAt)`,
        {
          id: placement.id,
          deviceId: placement.deviceId,
          rootId: placement.rootId,
          folderItemId: placement.folderItemId,
          mode: placement.mode,
          localPath: placement.localPath,
          enabled: placement.enabled ? 1 : 0,
          createdBy: placement.createdBy,
          now: this.context.now(),
          ...settingsParameters(placement),
          ...statusParameters(status),
        },
      );
      const row = this.byId(placement.id);
      this.context.changed('drive_placements', 'INSERT', row, null);
      return row;
    });
  }

  retarget(id: string, target: DrivePlacementTarget): DrivePlacement {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'change the drive placement',
        `update drive_placements set mode = $mode, local_path = $localPath, enabled = $enabled,
          read_only = $readOnly, excluded = $excluded, ignore_patterns = $ignorePatterns,
          conflict_copies = $conflictCopies where id = $id`,
        {
          id,
          ...settingsParameters(target),
          mode: target.mode,
          localPath: target.localPath,
          enabled: target.enabled ? 1 : 0,
          readOnly: target.readOnly ? 1 : 0,
        },
      );
      return this.emit(id, before);
    });
  }

  setHold(id: string, hold: DrivePlacementHold | null): DrivePlacement {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'hold or release the drive placement',
        'update drive_placements set hold = $hold where id = $id',
        { id, hold },
      );
      return this.emit(id, before);
    });
  }

  writeStatus(id: string, status: DrivePlacementStatus): DrivePlacement {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'record the drive placement status',
        `update drive_placements set state = $state, tier = $tier, basic_limits = $basicLimits,
          read_only = $readOnly, route = $route, cache_bytes = $cacheBytes,
          pinned_bytes = $pinnedBytes, open_files = $openFiles,
          pending_uploads = $pendingUploads, need_bytes = $needBytes,
          last_synced_at = $lastSyncedAt, errors = $errors, reason = $reason,
          reported_at = $reportedAt where id = $id`,
        { id, ...statusParameters(status) },
      );
      return this.emit(id, before);
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'remove the drive placement',
        'delete from drive_placements where id = $id',
        { id },
      );
      this.context.changed('drive_placements', 'DELETE', null, before);
    });
  }

  private emit(id: string, before: DrivePlacement): DrivePlacement {
    const row = this.byId(id);
    this.context.changed('drive_placements', 'UPDATE', row, before);
    return row;
  }
}

function statusParameters(status: DrivePlacementStatus): Record<string, string | number | null> {
  return {
    state: status.state,
    tier: status.tier,
    basicLimits: status.basicLimits === null ? null : jsonText(status.basicLimits),
    readOnly: status.readOnly ? 1 : 0,
    route: status.route,
    cacheBytes: status.cacheBytes,
    pinnedBytes: status.pinnedBytes,
    openFiles: status.openFiles,
    pendingUploads: status.pendingUploads,
    needBytes: status.needBytes,
    lastSyncedAt: status.lastSyncedAt,
    errors: jsonText(z.array(DRIVE_SYNC_ERROR).parse(status.errors)),
    reason: status.reason,
    reportedAt: status.reportedAt,
  };
}
