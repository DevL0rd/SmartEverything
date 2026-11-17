import {
  DRIVE_OFFLINE_ITEM,
  DRIVE_OFFLINE_STATES,
  type DriveOfflineItem,
  type DriveOfflineReportEntry,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';

const COLUMNS = 'client_id, item_id, profile_id, state, bytes, synced_rev, error, updated_at';

const OFFLINE_COLUMNS = z.strictObject({
  client_id: z.string(),
  item_id: z.string(),
  profile_id: z.string(),
  state: z.enum(DRIVE_OFFLINE_STATES),
  bytes: z.number(),
  synced_rev: z.number().nullable(),
  error: z.string().nullable(),
  updated_at: z.string(),
});

const STORED_OFFLINE = storedRow(
  OFFLINE_COLUMNS.transform((row): DriveOfflineItem =>
    DRIVE_OFFLINE_ITEM.parse({
      clientId: row.client_id,
      itemId: row.item_id,
      profileId: row.profile_id,
      state: row.state,
      bytes: row.bytes,
      syncedRev: row.synced_rev,
      error: row.error,
      updatedAt: row.updated_at,
    }),
  ),
  {},
);

const HELD_ITEM = z.strictObject({
  item_id: z.string(),
  client_id: z.string(),
  profile_id: z.string(),
});

const HELD = z.strictObject({ held: z.union([z.literal(0), z.literal(1)]) });

export interface DriveOfflineHolder {
  readonly clientId: string;
  readonly profileId: string;
}

export interface DriveOfflineHeld extends DriveOfflineHolder {
  readonly itemId: string;
}

export interface DriveOfflineKey {
  readonly clientId: string;
  readonly itemId: string;
}

export interface DriveOfflineWindow {
  readonly items: readonly DriveOfflineItem[];
  readonly next: DriveOfflineKey | null;
}

export class DriveOfflineRepository {
  constructor(private readonly context: StoreContext) {}

  find(clientId: string, itemId: string): DriveOfflineItem | undefined {
    return this.context.sql.get(
      STORED_OFFLINE,
      `select ${COLUMNS} from drive_offline_items where client_id = $clientId and item_id = $itemId`,
      { clientId, itemId },
    );
  }

  forProfile(
    profileId: string,
    clientId: string | null,
    after: DriveOfflineKey | null,
    limit: number,
  ): DriveOfflineWindow {
    const rows = this.context.sql.all(
      STORED_OFFLINE,
      `select ${COLUMNS} from drive_offline_items where profile_id = $profileId
        ${clientId === null ? '' : 'and client_id = $clientId'}
        ${after === null ? '' : 'and (client_id, item_id) > ($afterClient, $afterItem)'}
        order by client_id, item_id limit $limit`,
      {
        profileId,
        limit,
        ...(clientId === null ? {} : { clientId }),
        ...(after === null ? {} : { afterClient: after.clientId, afterItem: after.itemId }),
      },
    );
    const last = rows.at(-1);
    return {
      items: rows,
      next:
        rows.length === limit && last !== undefined
          ? { clientId: last.clientId, itemId: last.itemId }
          : null,
    };
  }

  held(): boolean {
    return (
      found(
        this.context.sql.get(HELD, 'select exists (select 1 from drive_offline_items) as held'),
        'drive offline count',
        'all',
      ).held === 1
    );
  }

  holdersOfEach(itemIds: readonly string[]): readonly DriveOfflineHeld[] {
    return this.context.sql
      .all(
        HELD_ITEM,
        `select distinct i.id as item_id, o.client_id, o.profile_id
          from drive_offline_items o
          cross join drive_items p on p.id = o.item_id
          cross join drive_items i on i.id in (select value from json_each($itemIds))
          where (p.id = i.id or (p.kind = 'folder' and p.root_id = i.root_id
              and i.rel_path >= p.rel_path || '/' and i.rel_path < p.rel_path || '0'))
          order by i.id, o.client_id, o.profile_id`,
        { itemIds: JSON.stringify(itemIds) },
      )
      .map((row) => ({ itemId: row.item_id, clientId: row.client_id, profileId: row.profile_id }));
  }

  set(clientId: string, itemId: string, profileId: string, on: boolean): void {
    this.context.write(() => {
      const before = this.find(clientId, itemId);
      if (!on) {
        if (before === undefined) return;
        this.context.sql.run(
          'unpin the drive item from the phone',
          'delete from drive_offline_items where client_id = $clientId and item_id = $itemId',
          { clientId, itemId },
        );
        this.context.changed('drive_offline_items', 'DELETE', null, before);
        return;
      }
      if (before !== undefined) return;
      this.context.sql.run(
        'pin the drive item to the phone',
        `insert into drive_offline_items (${COLUMNS})
          values ($clientId, $itemId, $profileId, 'waiting', 0, null, null, $now)`,
        { clientId, itemId, profileId, now: this.context.now() },
      );
      const row = this.find(clientId, itemId);
      if (row !== undefined) this.context.changed('drive_offline_items', 'INSERT', row, null);
    });
  }

  report(clientId: string, entries: readonly DriveOfflineReportEntry[]): void {
    this.context.write(() => {
      for (const entry of entries) {
        const before = this.find(clientId, entry.itemId);
        if (before === undefined) continue;
        this.context.sql.run(
          'record what the phone holds offline',
          `update drive_offline_items set state = $state, bytes = $bytes, synced_rev = $rev,
            error = $error, updated_at = $now where client_id = $clientId and item_id = $itemId`,
          {
            clientId,
            itemId: entry.itemId,
            state: entry.state,
            bytes: entry.state === 'ready' ? entry.bytes : before.bytes,
            rev: entry.state === 'ready' ? entry.rev : before.syncedRev,
            error: entry.state === 'failed' ? entry.error : null,
            now: this.context.now(),
          },
        );
        const after = this.find(clientId, entry.itemId);
        if (after !== undefined)
          this.context.changed('drive_offline_items', 'UPDATE', after, before);
      }
    });
  }
}
