import { DRIVE_UPLOAD, DRIVE_UPLOAD_STATES, type DriveUpload } from '@smarteverything/domain';
import { z } from 'zod';
import { found, StoreNotFoundError, type StoreContext } from '../context';
import { StoreConflictError } from '../sql';

const COLUMNS = `id, root_id, target_kind, target_id, base_rev, name, length, offset, state,
  failure_reason, profile_id, client_id, node_id, created_at, expires_at`;

const UPLOAD_COLUMNS = z.strictObject({
  id: z.string(),
  root_id: z.string(),
  target_kind: z.enum(['folder', 'item']),
  target_id: z.string(),
  base_rev: z.number().nullable(),
  name: z.string(),
  length: z.number(),
  offset: z.number(),
  state: z.enum(DRIVE_UPLOAD_STATES),
  failure_reason: z.string().nullable(),
  profile_id: z.string(),
  client_id: z.string().nullable(),
  node_id: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
});

const STORED_UPLOAD = UPLOAD_COLUMNS.transform((row): DriveUpload => {
  return DRIVE_UPLOAD.parse({
    id: row.id,
    rootId: row.root_id,
    target:
      row.target_kind === 'folder'
        ? { kind: 'folder', folderId: row.target_id }
        : { kind: 'item', itemId: row.target_id, baseRev: row.base_rev },
    name: row.name,
    length: row.length,
    offset: row.offset,
    state: row.state,
    failureReason: row.failure_reason,
    profileId: row.profile_id,
    clientId: row.client_id,
    nodeId: row.node_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });
});

const EXPECTED_HASH = z.strictObject({ expected_sha256: z.string().nullable() });

const RESULT = z.strictObject({ itemId: z.uuid(), name: z.string().min(1) });

const SOONEST = z.object({ expires_at: z.string().nullable() });

export interface DriveUploadOwner {
  readonly profileId: string;
  readonly clientId: string | null;
  readonly nodeId: string | null;
}

export interface DriveUploadCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface DriveUploadWindow {
  readonly uploads: readonly DriveUpload[];
  readonly next: DriveUploadCursor | null;
}

export class DriveUploadsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveUpload | undefined {
    return this.context.sql.get(
      STORED_UPLOAD,
      `select ${COLUMNS} from drive_uploads where id = $id`,
      { id },
    );
  }

  byId(id: string): DriveUpload {
    return found(this.find(id), 'drive upload', id);
  }

  findOwned(id: string, owner: DriveUploadOwner): DriveUpload | undefined {
    return this.context.sql.get(
      STORED_UPLOAD,
      `select ${COLUMNS} from drive_uploads
        where id = $id and profile_id = $profileId and client_id is $clientId and node_id is $nodeId`,
      { id, profileId: owner.profileId, clientId: owner.clientId, nodeId: owner.nodeId },
    );
  }

  insert(upload: DriveUpload, expectedSha256: string | null = null): DriveUpload {
    return this.context.write(() => {
      this.context.sql.run(
        'open the drive upload',
        `insert into drive_uploads (${COLUMNS}, expected_sha256) values ($id, $rootId, $targetKind, $targetId,
          $baseRev, $name, $length, $offset, $state, $failureReason, $profileId, $clientId,
          $nodeId, $createdAt, $expiresAt, $expectedSha256)`,
        {
          id: upload.id,
          rootId: upload.rootId,
          targetKind: upload.target.kind,
          targetId: upload.target.kind === 'folder' ? upload.target.folderId : upload.target.itemId,
          baseRev: upload.target.kind === 'item' ? upload.target.baseRev : null,
          name: upload.name,
          length: upload.length,
          offset: upload.offset,
          state: upload.state,
          failureReason: upload.failureReason,
          profileId: upload.profileId,
          clientId: upload.clientId,
          nodeId: upload.nodeId,
          createdAt: upload.createdAt,
          expiresAt: upload.expiresAt,
          expectedSha256,
        },
      );
      return this.byId(upload.id);
    });
  }

  setOffset(id: string, offset: number): DriveUpload {
    return this.context.write(() => {
      const changed = this.context.sql.run(
        'advance the drive upload',
        "update drive_uploads set offset = $offset where id = $id and state = 'open'",
        { id, offset },
      );
      return this.afterGuarded(id, changed, 'open');
    });
  }

  transition(
    id: string,
    from: DriveUpload['state'],
    to: DriveUpload['state'],
    failureReason: string | null,
  ): DriveUpload {
    return this.context.write(() => {
      const changed = this.context.sql.run(
        'change the drive upload state',
        `update drive_uploads set state = $to, failure_reason = $failureReason
          where id = $id and state = $from`,
        { id, from, to, failureReason },
      );
      return this.afterGuarded(id, changed, from);
    });
  }

  complete(id: string, item: { readonly id: string; readonly name: string }): void {
    this.context.write(() => {
      this.context.sql.run(
        'record the completed upload item',
        'insert into drive_upload_results (upload_id, item_id, name) values ($id, $itemId, $name)',
        { id, itemId: item.id, name: item.name },
      );
      this.transition(id, 'committing', 'complete', null);
    });
  }

  expectedHash(id: string): string | null {
    return found(
      this.context.sql.get(
        EXPECTED_HASH,
        'select expected_sha256 from drive_uploads where id = $id',
        { id },
      ),
      'drive upload expected hash',
      id,
    ).expected_sha256;
  }

  result(id: string): z.infer<typeof RESULT> | undefined {
    return this.context.sql.get(
      RESULT,
      'select item_id as itemId, name from drive_upload_results where upload_id = $id',
      { id },
    );
  }

  remove(id: string): DriveUpload {
    return this.context.write(() => {
      const upload = this.byId(id);
      this.context.sql.run('remove the drive upload', 'delete from drive_uploads where id = $id', {
        id,
      });
      return upload;
    });
  }

  expire(at: string): DriveUpload[] {
    return this.context.write(() => {
      const due = this.context.sql.all(
        STORED_UPLOAD,
        `select ${COLUMNS} from drive_uploads
          where state = 'open' and expires_at <= $at order by expires_at, id`,
        { at },
      );
      for (const upload of due) {
        this.transition(upload.id, upload.state, 'expired', null);
      }
      return due.map((upload) => this.byId(upload.id));
    });
  }

  soonestExpiry(): string | null {
    return (
      this.context.sql.get(
        SOONEST,
        `select min(expires_at) as expires_at from drive_uploads where state = 'open'`,
      )?.expires_at ?? null
    );
  }

  forProfile(profileId: string, after: DriveUploadCursor | null, limit: number): DriveUploadWindow {
    const uploads = this.context.sql.all(
      STORED_UPLOAD,
      `select ${COLUMNS} from drive_uploads
        where profile_id = $profileId
          ${after === null ? '' : 'and (created_at, id) < ($createdAt, $afterId)'}
        order by created_at desc, id desc limit $limit`,
      after === null
        ? { profileId, limit }
        : { profileId, limit, createdAt: after.createdAt, afterId: after.id },
    );
    const last = uploads.at(-1);
    return {
      uploads,
      next:
        uploads.length === limit && last !== undefined
          ? { createdAt: last.createdAt, id: last.id }
          : null,
    };
  }

  private afterGuarded(id: string, changed: number, expected: DriveUpload['state']): DriveUpload {
    const upload = this.find(id);
    if (upload === undefined) {
      throw new StoreNotFoundError('drive upload', id);
    }
    if (changed === 0) {
      throw new StoreConflictError(
        'change the drive upload',
        new Error(`the upload is ${upload.state}, not ${expected}`),
      );
    }
    return upload;
  }
}
