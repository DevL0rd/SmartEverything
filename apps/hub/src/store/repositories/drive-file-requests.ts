import {
  DRIVE_FILE_REQUEST,
  DRIVE_FILE_REQUEST_UPLOAD,
  type DriveFileRequest,
  type DriveFileRequestChange,
  type DriveFileRequestUpload,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';

const SELECT = `select q.id, q.folder_item_id, i.name as folder_name, q.created_by, q.title,
    q.message, q.expires_at, q.closed_at, q.uploads, q.bytes, q.created_at
  from drive_file_requests q join drive_items i on i.id = q.folder_item_id`;

const REQUEST_COLUMNS = z.strictObject({
  id: z.string(),
  folder_item_id: z.string(),
  folder_name: z.string(),
  created_by: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  expires_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  uploads: z.number(),
  bytes: z.number(),
  created_at: z.string(),
});

const UPLOADER = z.strictObject({ uploader_name: z.string() });

const STORED_REQUEST = storedRow(
  REQUEST_COLUMNS.transform((row): DriveFileRequest =>
    DRIVE_FILE_REQUEST.parse({
      id: row.id,
      folderItemId: row.folder_item_id,
      folderName: row.folder_name,
      createdBy: row.created_by,
      title: row.title,
      message: row.message,
      expiresAt: row.expires_at,
      closedAt: row.closed_at,
      uploads: row.uploads,
      bytes: row.bytes,
      createdAt: row.created_at,
    }),
  ),
  {},
);

const UPLOAD_COLUMNS = z.strictObject({
  request_id: z.string(),
  item_id: z.string(),
  name: z.string(),
  bytes: z.number(),
  uploader_name: z.string(),
  uploaded_at: z.string(),
});

const STORED_UPLOAD = storedRow(
  UPLOAD_COLUMNS.transform((row): DriveFileRequestUpload =>
    DRIVE_FILE_REQUEST_UPLOAD.parse({
      requestId: row.request_id,
      itemId: row.item_id,
      name: row.name,
      bytes: row.bytes,
      uploaderName: row.uploader_name,
      uploadedAt: row.uploaded_at,
    }),
  ),
  {},
);

export interface DriveFileRequestInput {
  readonly folderItemId: string;
  readonly createdBy: string;
  readonly title: string;
  readonly message: string | null;
  readonly tokenHash: string;
  readonly expiresAt: string | null;
}

export interface DriveFileRequestUploadInput {
  readonly requestId: string;
  readonly itemId: string;
  readonly uploaderName: string;
  readonly bytes: number;
}

export interface DriveFileRequestWindow {
  readonly requests: readonly DriveFileRequest[];
  readonly next: string | null;
}

export interface DriveFileRequestUploadWindow {
  readonly uploads: readonly DriveFileRequestUpload[];
  readonly next: string | null;
}

export class DriveFileRequestsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): DriveFileRequest | undefined {
    return this.context.sql.get(STORED_REQUEST, `${SELECT} where q.id = $id`, { id });
  }

  byId(id: string): DriveFileRequest {
    return found(this.find(id), 'drive file request', id);
  }

  byToken(tokenHash: string): DriveFileRequest | undefined {
    return this.context.sql.get(STORED_REQUEST, `${SELECT} where q.token_hash = $tokenHash`, {
      tokenHash,
    });
  }

  madeBy(
    createdBy: string,
    folderItemId: string | null,
    after: string | null,
    limit: number,
  ): DriveFileRequestWindow {
    const rows = this.context.sql.all(
      STORED_REQUEST,
      `${SELECT} where q.created_by = $createdBy
        ${folderItemId === null ? '' : 'and q.folder_item_id = $folderItemId'}
        ${after === null ? '' : 'and (q.created_at, q.id) < (select created_at, id from drive_file_requests where id = $after)'}
        order by q.created_at desc, q.id desc limit $limit`,
      {
        createdBy,
        limit,
        ...(folderItemId === null ? {} : { folderItemId }),
        ...(after === null ? {} : { after }),
      },
    );
    const last = rows.at(-1);
    return {
      requests: rows,
      next: rows.length === limit && last !== undefined ? last.id : null,
    };
  }

  create(input: DriveFileRequestInput): DriveFileRequest {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'create the drive file request',
        `insert into drive_file_requests (id, folder_item_id, created_by, title, message,
          token_hash, expires_at, closed_at, uploads, bytes, created_at)
          values ($id, $folderItemId, $createdBy, $title, $message, $tokenHash, $expiresAt, null,
            0, 0, $now)`,
        {
          id,
          folderItemId: input.folderItemId,
          createdBy: input.createdBy,
          title: input.title,
          message: input.message,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          now: this.context.now(),
        },
      );
      const created = this.byId(id);
      this.context.changed('drive_file_requests', 'INSERT', created, null);
      return created;
    });
  }

  update(id: string, change: DriveFileRequestChange): DriveFileRequest {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'change the drive file request',
        'update drive_file_requests set title = $title, message = $message, expires_at = $expiresAt where id = $id',
        {
          id,
          title: change.title ?? before.title,
          message: change.message === undefined ? before.message : change.message,
          expiresAt: change.expiresAt === undefined ? before.expiresAt : change.expiresAt,
        },
      );
      return this.announced(before);
    });
  }

  close(id: string): DriveFileRequest {
    return this.context.write(() => {
      const before = this.byId(id);
      if (before.closedAt !== null) return before;
      this.context.sql.run(
        'close the drive file request',
        'update drive_file_requests set closed_at = $now where id = $id',
        { id, now: this.context.now() },
      );
      return this.announced(before);
    });
  }

  recordUpload(input: DriveFileRequestUploadInput): DriveFileRequest {
    return this.context.write(() => {
      const before = this.byId(input.requestId);
      this.context.sql.run(
        'record the file request upload',
        `insert into drive_file_request_uploads (request_id, item_id, uploader_name, uploaded_at)
          values ($requestId, $itemId, $uploaderName, $now)`,
        {
          requestId: input.requestId,
          itemId: input.itemId,
          uploaderName: input.uploaderName,
          now: this.context.now(),
        },
      );
      this.context.sql.run(
        'count the file request upload',
        'update drive_file_requests set uploads = uploads + 1, bytes = bytes + $bytes where id = $id',
        { id: input.requestId, bytes: input.bytes },
      );
      return this.announced(before);
    });
  }

  uploaderOf(itemId: string): string | null {
    return (
      this.context.sql.get(
        UPLOADER,
        `select uploader_name from drive_file_request_uploads where item_id = $itemId
          order by uploaded_at limit 1`,
        { itemId },
      )?.uploader_name ?? null
    );
  }

  uploads(requestId: string, after: string | null, limit: number): DriveFileRequestUploadWindow {
    const rows = this.context.sql.all(
      STORED_UPLOAD,
      `select u.request_id, u.item_id, i.name, i.bytes, u.uploader_name, u.uploaded_at
        from drive_file_request_uploads u join drive_items i on i.id = u.item_id
        where u.request_id = $requestId
          ${after === null ? '' : 'and (u.uploaded_at, u.item_id) < (select uploaded_at, item_id from drive_file_request_uploads where request_id = $requestId and item_id = $after)'}
        order by u.uploaded_at desc, u.item_id desc limit $limit`,
      after === null ? { requestId, limit } : { requestId, after, limit },
    );
    const last = rows.at(-1);
    return {
      uploads: rows,
      next: rows.length === limit && last !== undefined ? last.itemId : null,
    };
  }

  private announced(before: DriveFileRequest): DriveFileRequest {
    const after = this.byId(before.id);
    this.context.changed('drive_file_requests', 'UPDATE', after, before);
    return after;
  }
}
