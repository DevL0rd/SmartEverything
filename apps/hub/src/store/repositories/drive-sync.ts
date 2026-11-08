import {
  DRIVE_SYNC_CLIENT,
  DRIVE_SYNC_ERROR,
  type DriveSyncClient,
  type DriveSyncClientUpdate,
  type DriveSyncError,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';

const COLUMNS = `client_id, root_id, device_id, profile_id, enabled, selected, last_seq,
  last_seen_at, need_bytes, errors`;

const CLIENT_COLUMNS = z.strictObject({
  client_id: z.string(),
  root_id: z.string(),
  device_id: z.string(),
  profile_id: z.string(),
  enabled: z.boolean(),
  selected: z.array(z.string()),
  last_seq: z.number(),
  last_seen_at: z.string().nullable(),
  need_bytes: z.number(),
  errors: z.array(z.unknown()),
});

const STORED_CLIENT = storedRow(
  CLIENT_COLUMNS.transform((row): DriveSyncClient =>
    DRIVE_SYNC_CLIENT.parse({
      clientId: row.client_id,
      rootId: row.root_id,
      deviceId: row.device_id,
      profileId: row.profile_id,
      enabled: row.enabled,
      selected: row.selected,
      lastSeq: row.last_seq,
      lastSeenAt: row.last_seen_at,
      needBytes: row.need_bytes,
      errors: row.errors,
    }),
  ),
  { flags: ['enabled'], json: ['selected', 'errors'] },
);

const STORED_OP = z
  .strictObject({ result: SQL_JSON })
  .transform((row) => z.record(z.string(), z.unknown()).parse(row.result));

export interface DriveSyncClientOwner {
  readonly deviceId: string;
  readonly profileId: string;
}

export interface DriveSyncClientReport {
  readonly lastSeq: number;
  readonly needBytes: number;
  readonly errors: readonly DriveSyncError[];
}

export class DriveSyncClientsRepository {
  constructor(private readonly context: StoreContext) {}

  find(clientId: string, rootId: string): DriveSyncClient | undefined {
    return this.context.sql.get(
      STORED_CLIENT,
      `select ${COLUMNS} from drive_sync_clients where client_id = $clientId and root_id = $rootId`,
      { clientId, rootId },
    );
  }

  byKey(clientId: string, rootId: string): DriveSyncClient {
    return found(this.find(clientId, rootId), 'drive sync client', `${clientId}/${rootId}`);
  }

  forRoot(rootId: string): DriveSyncClient[] {
    return this.context.sql.all(
      STORED_CLIENT,
      `select ${COLUMNS} from drive_sync_clients where root_id = $rootId order by client_id`,
      { rootId },
    );
  }

  forClient(clientId: string): DriveSyncClient[] {
    return this.context.sql.all(
      STORED_CLIENT,
      `select ${COLUMNS} from drive_sync_clients where client_id = $clientId order by root_id`,
      { clientId },
    );
  }

  set(update: DriveSyncClientUpdate, owner: DriveSyncClientOwner): DriveSyncClient {
    return this.context.write(() => {
      const before = this.find(update.clientId, update.rootId);
      this.context.sql.run(
        'save the drive sync client',
        `insert into drive_sync_clients (${COLUMNS})
          values ($clientId, $rootId, $deviceId, $profileId, $enabled, $selected, 0, null, 0, '[]')
          on conflict (client_id, root_id) do update set enabled = excluded.enabled,
            selected = excluded.selected`,
        {
          clientId: update.clientId,
          rootId: update.rootId,
          deviceId: owner.deviceId,
          profileId: owner.profileId,
          enabled: update.enabled ? 1 : 0,
          selected: jsonText(update.selected),
        },
      );
      return this.emit(update.clientId, update.rootId, before);
    });
  }

  report(clientId: string, rootId: string, report: DriveSyncClientReport): DriveSyncClient {
    return this.context.write(() => {
      const before = this.byKey(clientId, rootId);
      this.context.sql.run(
        'record the drive sync client state',
        `update drive_sync_clients set last_seq = $lastSeq, need_bytes = $needBytes,
          errors = $errors, last_seen_at = $at where client_id = $clientId and root_id = $rootId`,
        {
          clientId,
          rootId,
          lastSeq: report.lastSeq,
          needBytes: report.needBytes,
          errors: jsonText(z.array(DRIVE_SYNC_ERROR).parse(report.errors)),
          at: this.context.now(),
        },
      );
      return this.emit(clientId, rootId, before);
    });
  }

  remove(clientId: string, rootId: string): void {
    this.context.write(() => {
      const before = this.byKey(clientId, rootId);
      this.context.sql.run(
        'remove the drive sync client',
        'delete from drive_sync_clients where client_id = $clientId and root_id = $rootId',
        { clientId, rootId },
      );
      this.context.changed('drive_sync_clients', 'DELETE', null, before);
    });
  }

  private emit(
    clientId: string,
    rootId: string,
    before: DriveSyncClient | undefined,
  ): DriveSyncClient {
    const row = this.byKey(clientId, rootId);
    this.context.changed(
      'drive_sync_clients',
      before === undefined ? 'INSERT' : 'UPDATE',
      row,
      before ?? null,
    );
    return row;
  }
}

export class DriveSyncOpsRepository {
  constructor(private readonly context: StoreContext) {}

  recall(clientId: string, opId: string): Readonly<Record<string, unknown>> | undefined {
    return this.context.sql.get(
      STORED_OP,
      'select result from drive_sync_ops where client_id = $clientId and op_id = $opId',
      { clientId, opId },
    );
  }

  remember(clientId: string, opId: string, result: Readonly<Record<string, unknown>>): void {
    this.context.write(() => {
      this.context.sql.run(
        'remember the drive sync operation',
        `insert into drive_sync_ops (client_id, op_id, result, at)
          values ($clientId, $opId, $result, $at)`,
        { clientId, opId, result: jsonText(result), at: this.context.now() },
      );
    });
  }

  forgetBefore(at: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'forget the old drive sync operations',
        'delete from drive_sync_ops where at < $at',
        { at },
      ),
    );
  }
}
