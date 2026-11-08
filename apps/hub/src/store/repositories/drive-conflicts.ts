import {
  DRIVE_CONFLICT,
  DRIVE_CONFLICT_RESOLUTIONS,
  type DriveConflict,
  type DriveConflictResolution,
} from '@smarteverything/domain';
import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { inList } from '../sql';

const COLUMNS = `id, root_id, item_id, conflict_item_id, rel_path, conflict_rel_path, hub_rev,
  base_rev, device_id, profile_id, at, resolved_at, resolution`;

const STORED_CONFLICT = z
  .strictObject({
    id: z.string(),
    root_id: z.string(),
    item_id: z.string(),
    conflict_item_id: z.string(),
    rel_path: z.string(),
    conflict_rel_path: z.string(),
    hub_rev: z.number(),
    base_rev: z.number(),
    device_id: z.string(),
    profile_id: z.string().nullable(),
    at: z.string(),
    resolved_at: z.string().nullable(),
    resolution: z.enum(DRIVE_CONFLICT_RESOLUTIONS).nullable(),
  })
  .transform((row) =>
    DRIVE_CONFLICT.parse({
      id: row.id,
      rootId: row.root_id,
      itemId: row.item_id,
      conflictItemId: row.conflict_item_id,
      relPath: row.rel_path,
      conflictRelPath: row.conflict_rel_path,
      hubRev: row.hub_rev,
      baseRev: row.base_rev,
      deviceId: row.device_id,
      profileId: row.profile_id,
      at: row.at,
      resolvedAt: row.resolved_at,
      resolution: row.resolution,
    }),
  );

export interface DriveConflictAfter {
  readonly at: string;
  readonly id: string;
}

export interface DriveConflictWindow {
  readonly rootIds: readonly string[];
  readonly after: DriveConflictAfter | null;
  readonly limit: number;
}

export class DriveConflictsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveConflict | undefined {
    return this.context.sql.get(
      STORED_CONFLICT,
      `select ${COLUMNS} from drive_conflicts where id = $id`,
      { id },
    );
  }

  insert(conflict: DriveConflict): void {
    this.context.write(() => {
      this.context.sql.run(
        'record the drive conflict',
        `insert into drive_conflicts (${COLUMNS}) values ($id, $rootId, $itemId, $conflictItemId,
          $relPath, $conflictRelPath, $hubRev, $baseRev, $deviceId, $profileId, $at, $resolvedAt,
          $resolution)`,
        { ...conflict },
      );
    });
  }

  resolve(id: string, resolution: DriveConflictResolution, at: string): DriveConflict {
    return this.context.write(() => {
      this.context.sql.run(
        'resolve the drive conflict',
        'update drive_conflicts set resolution = $resolution, resolved_at = $at where id = $id',
        { id, resolution, at },
      );
      return found(this.find(id), 'drive conflict', id);
    });
  }

  page(window: DriveConflictWindow): DriveConflict[] {
    const roots = inList('root_id', 'roots', window.rootIds);
    const after =
      window.after === null ? '' : 'and (at < $afterAt or (at = $afterAt and id < $afterId))';
    return this.context.sql.all(
      STORED_CONFLICT,
      `select ${COLUMNS} from drive_conflicts where ${roots.text} ${after}
       order by at desc, id desc limit $limit`,
      {
        ...roots.parameters,
        limit: window.limit,
        ...(window.after === null ? {} : { afterAt: window.after.at, afterId: window.after.id }),
      },
    );
  }
}
