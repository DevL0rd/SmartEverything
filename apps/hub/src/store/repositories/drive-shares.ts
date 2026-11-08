import {
  DRIVE_SHARE,
  DRIVE_SHARE_PERMISSIONS,
  type DriveShare,
  type DriveSharePermission,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, StoreNotFoundError, type StoreContext } from '../context';
import { inList } from '../sql';

const COLUMNS = `id, item_id, permission, expires_at, password_hash is not null as has_password,
  created_by, revoked_at, opens, downloads, last_opened_at`;

const SHARE_COLUMNS = z.strictObject({
  id: z.string(),
  item_id: z.string(),
  permission: z.enum(DRIVE_SHARE_PERMISSIONS),
  expires_at: z.string().nullable(),
  has_password: z.boolean(),
  created_by: z.string(),
  revoked_at: z.string().nullable(),
  opens: z.number(),
  downloads: z.number(),
  last_opened_at: z.string().nullable(),
});

function shareOf(row: z.output<typeof SHARE_COLUMNS>): DriveShare {
  return DRIVE_SHARE.parse({
    id: row.id,
    itemId: row.item_id,
    permission: row.permission,
    expiresAt: row.expires_at,
    hasPassword: row.has_password,
    createdBy: row.created_by,
    revokedAt: row.revoked_at,
    opens: row.opens,
    downloads: row.downloads,
    lastOpenedAt: row.last_opened_at,
  });
}

const CODEC = { flags: ['has_password'] } as const;

const STORED_SHARE = storedRow(SHARE_COLUMNS.transform(shareOf), CODEC);

const STORED_RECORD = storedRow(
  SHARE_COLUMNS.extend({ password_hash: z.string().nullable() }).transform((row) => ({
    share: shareOf(row),
    passwordHash: row.password_hash,
  })),
  CODEC,
);

export interface DriveShareInsert {
  readonly id: string;
  readonly itemId: string;
  readonly tokenHash: string;
  readonly permission: DriveSharePermission;
  readonly expiresAt: string | null;
  readonly passwordHash: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface DriveShareRecord {
  readonly share: DriveShare;
  readonly passwordHash: string | null;
}

export type DriveShareEvent = 'open' | 'download';

export interface DriveShareWindow {
  readonly createdBy: string;
  readonly itemId: string | undefined;
  readonly after: { readonly at: string; readonly id: string } | null;
  readonly limit: number;
}

export class DriveSharesRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveShare | undefined {
    return this.context.sql.get(
      STORED_SHARE,
      `select ${COLUMNS} from drive_shares where id = $id`,
      {
        id,
      },
    );
  }

  byId(id: string): DriveShare {
    return found(this.find(id), 'drive share', id);
  }

  byTokenHash(tokenHash: string): DriveShareRecord | undefined {
    return this.context.sql.get(
      STORED_RECORD,
      `select ${COLUMNS}, password_hash from drive_shares where token_hash = $tokenHash`,
      { tokenHash },
    );
  }

  insert(share: DriveShareInsert): DriveShare {
    return this.context.write(() => {
      this.context.sql.run(
        'create the drive share',
        `insert into drive_shares (id, item_id, token_hash, permission, expires_at, password_hash,
          created_by, created_at, revoked_at, opens, downloads, last_opened_at)
          values ($id, $itemId, $tokenHash, $permission, $expiresAt, $passwordHash, $createdBy,
          $createdAt, null, 0, 0, null)`,
        {
          id: share.id,
          itemId: share.itemId,
          tokenHash: share.tokenHash,
          permission: share.permission,
          expiresAt: share.expiresAt,
          passwordHash: share.passwordHash,
          createdBy: share.createdBy,
          createdAt: share.createdAt,
        },
      );
      return this.byId(share.id);
    });
  }

  forItem(itemId: string): DriveShare[] {
    return this.context.sql.all(
      STORED_SHARE,
      `select ${COLUMNS} from drive_shares where item_id = $itemId order by created_at desc, id desc`,
      { itemId },
    );
  }

  madeBy(window: DriveShareWindow): DriveShare[] {
    const item = window.itemId === undefined ? '' : 'and item_id = $itemId';
    const after =
      window.after === null
        ? ''
        : 'and (created_at < $afterAt or (created_at = $afterAt and id < $afterId))';
    return this.context.sql.all(
      STORED_SHARE,
      `select ${COLUMNS} from drive_shares where created_by = $createdBy ${item} ${after}
       order by created_at desc, id desc limit $limit`,
      {
        createdBy: window.createdBy,
        limit: window.limit,
        ...(window.itemId === undefined ? {} : { itemId: window.itemId }),
        ...(window.after === null ? {} : { afterAt: window.after.at, afterId: window.after.id }),
      },
    );
  }

  createdAt(id: string): string {
    return found(
      this.context.sql.get(
        z.strictObject({ created_at: z.string() }),
        'select created_at from drive_shares where id = $id',
        { id },
      ),
      'drive share',
      id,
    ).created_at;
  }

  revoke(id: string, at: string): DriveShare {
    return this.context.write(() => {
      this.context.sql.run(
        'revoke the drive share',
        'update drive_shares set revoked_at = coalesce(revoked_at, $at) where id = $id',
        { id, at },
      );
      return this.byId(id);
    });
  }

  recordEvent(id: string, kind: DriveShareEvent, at: string): DriveShare {
    return this.context.write(() => {
      const column = kind === 'open' ? 'opens' : 'downloads';
      const changed = this.context.sql.run(
        'count the drive share use',
        `update drive_shares set ${column} = ${column} + 1, last_opened_at = $at where id = $id`,
        { id, at },
      );
      if (changed === 0) {
        throw new StoreNotFoundError('drive share', id);
      }
      this.context.sql.run(
        'log the drive share use',
        'insert into drive_share_events (share_id, kind, at) values ($id, $kind, $at)',
        { id, kind, at },
      );
      return this.byId(id);
    });
  }

  removeForItems(itemIds: readonly string[]): number {
    const filter = inList('item_id', 'ids', itemIds);
    return this.context.write(() =>
      this.context.sql.run(
        'remove the drive shares of the items',
        `delete from drive_shares where ${filter.text}`,
        filter.parameters,
      ),
    );
  }
}
