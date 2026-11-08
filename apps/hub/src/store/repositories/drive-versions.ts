import { DRIVE_VERSION, DRIVE_VIA, type DriveVersion } from '@smarteverything/domain';
import { z } from 'zod';
import { found, type StoreContext } from '../context';
import { inList, type SqlParameters } from '../sql';

const COLUMNS = `id, root_id, item_id, rev, sha256, bytes, at, purge_at, actor_profile_id, via,
  device_id, added_by_profile_id`;

const VERSION_COLUMNS = z.strictObject({
  id: z.string(),
  root_id: z.string(),
  item_id: z.string(),
  rev: z.number(),
  sha256: z.string(),
  bytes: z.number(),
  at: z.string(),
  purge_at: z.string(),
  actor_profile_id: z.string().nullable(),
  via: z.enum(DRIVE_VIA),
  device_id: z.string().nullable(),
  added_by_profile_id: z.string().nullable(),
});

export interface DriveVersionEntry {
  readonly rootId: string;
  readonly version: DriveVersion;
}

export interface DriveVersionFile {
  readonly rootId: string;
  readonly sha256: string;
}

export interface DriveVersionPurge {
  readonly removed: readonly DriveVersionEntry[];
  readonly unlink: readonly DriveVersionFile[];
}

export interface DriveVersionWindow {
  readonly versions: readonly DriveVersion[];
  readonly next: number | null;
}

export interface DriveVersionBytes {
  readonly addedByProfileId: string | null;
  readonly bytes: number;
}

const STORED_ENTRY = VERSION_COLUMNS.transform((row): DriveVersionEntry => ({
  rootId: row.root_id,
  version: DRIVE_VERSION.parse({
    id: row.id,
    itemId: row.item_id,
    rev: row.rev,
    sha256: row.sha256,
    bytes: row.bytes,
    at: row.at,
    purgeAt: row.purge_at,
    actorProfileId: row.actor_profile_id,
    via: row.via,
    deviceId: row.device_id,
    addedByProfileId: row.added_by_profile_id,
  }),
}));

const SOONEST = z.object({ purge_at: z.string().nullable() });

const COUNT = z.object({ count: z.number() });

const ADDER_BYTES = z.object({ added_by_profile_id: z.string().nullable(), bytes: z.number() });

export class DriveVersionsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveVersionEntry | undefined {
    return this.context.sql.get(
      STORED_ENTRY,
      `select ${COLUMNS} from drive_versions where id = $id`,
      {
        id,
      },
    );
  }

  byId(id: string): DriveVersionEntry {
    return found(this.find(id), 'drive version', id);
  }

  findRev(itemId: string, rev: number): DriveVersionEntry | undefined {
    return this.context.sql.get(
      STORED_ENTRY,
      `select ${COLUMNS} from drive_versions where item_id = $itemId and rev = $rev`,
      { itemId, rev },
    );
  }

  insert(rootId: string, version: DriveVersion): DriveVersionEntry {
    return this.context.write(() => {
      this.context.sql.run(
        'capture the drive version',
        `insert into drive_versions (${COLUMNS}) values ($id, $rootId, $itemId, $rev, $sha256,
          $bytes, $at, $purgeAt, $actor, $via, $deviceId, $addedBy)`,
        {
          id: version.id,
          rootId,
          itemId: version.itemId,
          rev: version.rev,
          sha256: version.sha256,
          bytes: version.bytes,
          at: version.at,
          purgeAt: version.purgeAt,
          actor: version.actorProfileId,
          via: version.via,
          deviceId: version.deviceId,
          addedBy: version.addedByProfileId,
        },
      );
      return this.byId(version.id);
    });
  }

  forItem(itemId: string, after: number | null, limit: number): DriveVersionWindow {
    const rows = this.context.sql.all(
      STORED_ENTRY,
      `select ${COLUMNS} from drive_versions
        where item_id = $itemId ${after === null ? '' : 'and rev < $after'}
        order by rev desc limit $limit`,
      after === null ? { itemId, limit } : { itemId, limit, after },
    );
    const last = rows.at(-1);
    return {
      versions: rows.map((row) => row.version),
      next: rows.length === limit && last !== undefined ? last.version.rev : null,
    };
  }

  references(rootId: string, sha256: string): number {
    return (
      this.context.sql.get(
        COUNT,
        'select count(*) as count from drive_versions where root_id = $rootId and sha256 = $sha256',
        { rootId, sha256 },
      )?.count ?? 0
    );
  }

  due(at: string, limit: number): DriveVersionEntry[] {
    return this.context.sql.all(
      STORED_ENTRY,
      `select ${COLUMNS} from drive_versions where purge_at <= $at order by purge_at, id limit $limit`,
      { at, limit },
    );
  }

  soonestPurge(): string | null {
    return (
      this.context.sql.get(SOONEST, 'select min(purge_at) as purge_at from drive_versions')
        ?.purge_at ?? null
    );
  }

  purge(ids: readonly string[]): DriveVersionPurge {
    const filter = inList('id', 'ids', ids);
    return this.purgeWhere(filter.text, filter.parameters);
  }

  purgeItem(itemId: string): DriveVersionPurge {
    return this.purgeWhere('item_id = $itemId', { itemId });
  }

  bytesByAdder(): DriveVersionBytes[] {
    return this.context.sql
      .all(
        ADDER_BYTES,
        'select added_by_profile_id, sum(bytes) as bytes from drive_versions group by added_by_profile_id',
      )
      .map((row) => ({ addedByProfileId: row.added_by_profile_id, bytes: row.bytes }));
  }

  private purgeWhere(condition: string, parameters: SqlParameters): DriveVersionPurge {
    return this.context.write(() => {
      const removed = this.context.sql.all(
        STORED_ENTRY,
        `select ${COLUMNS} from drive_versions where ${condition} order by id`,
        parameters,
      );
      this.context.sql.run(
        'purge the drive versions',
        `delete from drive_versions where ${condition}`,
        parameters,
      );
      const files = new Map<string, DriveVersionFile>();
      for (const { rootId, version } of removed) {
        files.set(`${rootId}/${version.sha256}`, { rootId, sha256: version.sha256 });
      }
      return {
        removed,
        unlink: [...files.values()].filter(
          (file) => this.references(file.rootId, file.sha256) === 0,
        ),
      };
    });
  }
}
