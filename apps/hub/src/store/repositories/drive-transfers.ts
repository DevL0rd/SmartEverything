import {
  DRIVE_ITEM_KINDS,
  DRIVE_TRANSFER,
  DRIVE_TRANSFER_STATES,
  type DriveTransfer,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';

const SELECT = `select t.id, t.item_id, i.name as item_name, i.kind as item_kind, i.bytes,
    t.from_profile_id, t.to_profile_id, t.state, t.created_at, t.answered_at
  from drive_transfers t join drive_items i on i.id = t.item_id`;

const TRANSFER_COLUMNS = z.strictObject({
  id: z.string(),
  item_id: z.string(),
  item_name: z.string(),
  item_kind: z.enum(DRIVE_ITEM_KINDS),
  bytes: z.number(),
  from_profile_id: z.string(),
  to_profile_id: z.string(),
  state: z.enum(DRIVE_TRANSFER_STATES),
  created_at: z.string(),
  answered_at: z.string().nullable(),
});

const STORED_TRANSFER = storedRow(
  TRANSFER_COLUMNS.transform((row): DriveTransfer =>
    DRIVE_TRANSFER.parse({
      id: row.id,
      itemId: row.item_id,
      itemName: row.item_name,
      itemKind: row.item_kind,
      bytes: row.bytes,
      fromProfileId: row.from_profile_id,
      toProfileId: row.to_profile_id,
      state: row.state,
      createdAt: row.created_at,
      answeredAt: row.answered_at,
    }),
  ),
  {},
);

export class DriveTransferOpenError extends Error {
  override readonly name = 'DriveTransferOpenError';

  constructor(readonly itemId: string) {
    super(`The item ${itemId} already has an open ownership transfer.`);
  }
}

export class DriveTransferAnsweredError extends Error {
  override readonly name = 'DriveTransferAnsweredError';

  constructor(readonly transferId: string) {
    super(`The ownership transfer ${transferId} was already answered.`);
  }
}

export interface DriveTransferInput {
  readonly id?: string | undefined;
  readonly itemId: string;
  readonly fromProfileId: string;
  readonly toProfileId: string;
}

export interface DriveTransferWindow {
  readonly transfers: readonly DriveTransfer[];
  readonly next: string | null;
}

export class DriveTransfersRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveTransfer | undefined {
    return this.context.sql.get(STORED_TRANSFER, `${SELECT} where t.id = $id`, { id });
  }

  byId(id: string): DriveTransfer {
    return found(this.find(id), 'drive transfer', id);
  }

  openFor(itemId: string): DriveTransfer | undefined {
    return this.context.sql.get(
      STORED_TRANSFER,
      `${SELECT} where t.item_id = $itemId and t.state = 'offered'`,
      { itemId },
    );
  }

  involving(profileId: string, after: string | null, limit: number): DriveTransferWindow {
    const rows = this.context.sql.all(
      STORED_TRANSFER,
      `${SELECT} where (t.from_profile_id = $profileId or t.to_profile_id = $profileId)
        ${after === null ? '' : 'and (t.created_at, t.id) < (select created_at, id from drive_transfers where id = $after)'}
        order by t.created_at desc, t.id desc limit $limit`,
      after === null ? { profileId, limit } : { profileId, after, limit },
    );
    const last = rows.at(-1);
    return {
      transfers: rows,
      next: rows.length === limit && last !== undefined ? last.id : null,
    };
  }

  offer(input: DriveTransferInput): DriveTransfer {
    return this.context.write(() => {
      if (this.openFor(input.itemId) !== undefined) throw new DriveTransferOpenError(input.itemId);
      const id = input.id ?? this.context.newId();
      this.context.sql.run(
        'offer the drive item for transfer',
        `insert into drive_transfers (id, item_id, from_profile_id, to_profile_id, state, created_at)
          values ($id, $itemId, $fromProfileId, $toProfileId, 'offered', $now)`,
        {
          id,
          itemId: input.itemId,
          fromProfileId: input.fromProfileId,
          toProfileId: input.toProfileId,
          now: this.context.now(),
        },
      );
      const created = this.byId(id);
      this.context.changed('drive_transfers', 'INSERT', created, null);
      return created;
    });
  }

  settle(id: string, state: 'accepted' | 'declined' | 'cancelled'): DriveTransfer {
    return this.context.write(() => {
      const before = this.byId(id);
      if (before.state !== 'offered') throw new DriveTransferAnsweredError(id);
      this.context.sql.run(
        'answer the drive transfer',
        'update drive_transfers set state = $state, answered_at = $now where id = $id',
        { id, state, now: this.context.now() },
      );
      const after = this.byId(id);
      this.context.changed('drive_transfers', 'UPDATE', after, before);
      return after;
    });
  }
}
